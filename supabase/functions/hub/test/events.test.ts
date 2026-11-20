import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, type TestContext } from "./helpers";

const ctx: TestContext = newContext();
const TOKEN = "events-token";

beforeAll(async () => {
  await seedDevice(ctx, TOKEN);
});

describe("events", () => {
  it("deduplicates by idempotency key and returns the stored id", async () => {
    const first = await call(ctx, "/events", {
      method: "POST",
      token: TOKEN,
      body: {
        type: "note.ready",
        source: "web",
        origin: "task-1",
        payload: { taskId: "task-1" },
        ts: "2026-11-20T09:00:00.000Z",
        idempotencyKey: "event-key-1",
      },
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: string; deduplicated: boolean };
    expect(firstBody.deduplicated).toBe(false);

    const duplicate = await call(ctx, "/events", {
      method: "POST",
      token: TOKEN,
      body: {
        type: "note.ready",
        source: "web",
        payload: { taskId: "different" },
        ts: "2026-11-20T09:01:00.000Z",
        idempotencyKey: "event-key-1",
      },
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ id: firstBody.id, deduplicated: true });

    const listed = await call(ctx, "/events?since=0", { token: TOKEN });
    const body = (await listed.json()) as {
      events: Array<{ id: string; type: string; payload: unknown; idempotencyKey: string }>;
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      id: firstBody.id,
      type: "note.ready",
      payload: { taskId: "task-1" },
      idempotencyKey: "event-key-1",
    });
  });
});
