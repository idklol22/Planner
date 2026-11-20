import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, type TestContext } from "./helpers";

const ctx: TestContext = newContext();
const TOKEN = "commands-token";

async function claim(device: string) {
  const response = await call(ctx, "/commands/claim", {
    method: "POST",
    token: TOKEN,
    body: { device },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { command: null | { id: string; status: string; claimedBy: string } };
}

beforeAll(async () => {
  await seedDevice(ctx, TOKEN);
});

describe("command claims", () => {
  it("gives one of two concurrent claimers the command", async () => {
    const enqueued = await call(ctx, "/commands", {
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

    const leaseUntil = ctx.store.peekCommand("cmd-lease")?.leaseUntil;
    expect(Date.parse(leaseUntil!)).toBeGreaterThan(Date.now());
  });

  it("reclaims an expired lease and completes the command", async () => {
    ctx.store.setCommandLease("cmd-lease", new Date(Date.now() - 60_000).toISOString());

    const reclaim = await claim("device-c");
    expect(reclaim.command?.id).toBe("cmd-lease");
    expect(reclaim.command?.claimedBy).toBe("device-c");

    const completed = await call(ctx, "/commands/cmd-lease/complete", {
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

describe("get command", () => {
  it("returns a command by id, 404 when missing", async () => {
    await call(ctx, "/commands", {
      method: "POST",
      token: TOKEN,
      body: { id: "cmd-get", type: "handoff", payload: { a: 1 } },
    });
    const found = await call(ctx, "/commands/cmd-get", { token: TOKEN });
    expect(found.status).toBe(200);
    expect(((await found.json()) as { command: { id: string; status: string } }).command).toMatchObject({
      id: "cmd-get",
      status: "queued",
    });
    const missing = await call(ctx, "/commands/nope", { token: TOKEN });
    expect(missing.status).toBe(404);
  });
});
