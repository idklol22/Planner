import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { call, seedDevice } from "./helpers";

const TOKEN = "commands-token";

async function claim(device: string) {
  const response = await call("/commands/claim", {
    method: "POST",
    token: TOKEN,
    body: { device },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { command: null | { id: string; status: string; claimedBy: string } };
}

beforeAll(async () => {
  await seedDevice(TOKEN);
});

describe("command claims", () => {
  it("gives one of two concurrent claimers the command", async () => {
    const enqueued = await call("/commands", {
      method: "POST",
      token: TOKEN,
      body: { id: "cmd-lease", type: "handoff", payload: { taskId: "task-1" } },
    });
    expect(enqueued.status).toBe(201);

    const [a, b] = await Promise.all([claim("device-a"), claim("device-b")]);
    const winners = [a, b].filter((result) => result.command !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0].command).toMatchObject({
      id: "cmd-lease",
      status: "claimed",
      claimedBy: expect.stringMatching(/^device-[ab]$/),
    });

    const loser = await env.DB.prepare("SELECT lease_until FROM command WHERE id = ?")
      .bind("cmd-lease")
      .first<{ lease_until: string }>();
    expect(Date.parse(loser!.lease_until)).toBeGreaterThan(Date.now());
  });

  it("reclaims an expired lease and completes the command", async () => {
    await env.DB.prepare("UPDATE command SET lease_until = ? WHERE id = ?")
      .bind(new Date(Date.now() - 60_000).toISOString(), "cmd-lease")
      .run();

    const reclaim = await claim("device-c");
    expect(reclaim.command?.id).toBe("cmd-lease");
    expect(reclaim.command?.claimedBy).toBe("device-c");

    const completed = await call("/commands/cmd-lease/complete", {
      method: "POST",
      token: TOKEN,
      body: { status: "done", result: { sent: true } },
    });
    expect(completed.status).toBe(200);
    const completedBody = (await completed.json()) as {
      ok: boolean;
      command: { status: string; result: unknown };
    };
    expect(completedBody.ok).toBe(true);
    expect(completedBody.command).toMatchObject({ status: "done", result: { sent: true } });

    const none = await claim("device-d");
    expect(none.command).toBeNull();
  });
});
