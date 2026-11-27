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

describe("stored note payloads", () => {
  const PHOTO = "data:image/png;base64,QUJDREVGRw==";
  const OTHER_PHOTO = "data:image/jpeg;base64,MTIzNDU2";

  function notePayload(markdown: string) {
    return {
      externalId: "task-1",
      subjectId: "subject-1",
      title: "Photos",
      date: "2026-11-27",
      markdown,
      finished: true,
    };
  }

  async function enqueue(id: string, type: string, payload: unknown) {
    const response = await call(ctx, "/commands", {
      method: "POST",
      token: TOKEN,
      body: { id, type, payload },
    });
    expect(response.status).toBe(201);
  }

  async function complete(id: string, status: "done" | "failed") {
    const response = await call(ctx, `/commands/${id}/complete`, {
      method: "POST",
      token: TOKEN,
      body: { status, result: { ok: status === "done" } },
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { command: { status: string; payload: { markdown: string } } };
  }

  function markdownOf(id: string): string {
    const payload = ctx.store.peekCommand(id)!.payload as { markdown: string };
    return payload.markdown;
  }

  beforeAll(async () => {
    // The "get command" test leaves cmd-get queued; clear the queue first.
    const pending = await claim("cleanup");
    if (pending.command?.id === "cmd-get") await complete("cmd-get", "done");
  });

  it("keeps the photos through a retry and strips them only on success", async () => {
    const payload = notePayload(`Review ![a](${PHOTO}) and ![b](${OTHER_PHOTO})`);
    await enqueue("cmd-photos", "harness.note", payload);

    const first = await claim("agent-1");
    expect(first.command?.id).toBe("cmd-photos");
    expect((first.command as { payload: typeof payload }).payload.markdown).toContain(PHOTO);

    // An expired lease is retried by another agent; it must still see the bytes.
    ctx.store.setCommandLease("cmd-photos", new Date(Date.now() - 60_000).toISOString());
    const retry = await claim("agent-2");
    expect(retry.command?.id).toBe("cmd-photos");
    expect((retry.command as { payload: typeof payload }).payload.markdown).toContain(PHOTO);
    expect(ctx.store.peekCommand("cmd-photos")!.status).toBe("claimed");

    const done = await complete("cmd-photos", "done");
    expect(done.command.status).toBe("done");
    expect(markdownOf("cmd-photos")).toBe("Review ![a](photo-removed) and ![b](photo-removed)");
    expect(done.command.payload.markdown).not.toContain("data:image/");

    const fetched = await call(ctx, "/commands/cmd-photos", { token: TOKEN });
    expect(fetched.status).toBe(200);
    const stored = ((await fetched.json()) as { command: { payload: { markdown: string } } }).command;
    expect(stored.payload.markdown).toBe("Review ![a](photo-removed) and ![b](photo-removed)");

    // Repeating a completion stays idempotent: already-redacted stays redacted.
    const again = await complete("cmd-photos", "done");
    expect(again.command.status).toBe("done");
    expect(markdownOf("cmd-photos")).toBe("Review ![a](photo-removed) and ![b](photo-removed)");
  });

  it("leaves the payload intact on failure and for other command types", async () => {
    await enqueue("cmd-failed", "harness.note", notePayload(`Notes ![a](${PHOTO})`));
    const claimed = await claim("agent-3");
    expect(claimed.command?.id).toBe("cmd-failed");
    const failed = await complete("cmd-failed", "failed");
    expect(failed.command.status).toBe("failed");
    expect(markdownOf("cmd-failed")).toContain(PHOTO);

    await enqueue("cmd-other", "other.task", { markdown: `![a](${PHOTO})` });
    const other = await claim("agent-4");
    expect(other.command?.id).toBe("cmd-other");
    await complete("cmd-other", "done");
    expect(markdownOf("cmd-other")).toContain(PHOTO);
  });
});
