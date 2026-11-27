import { describe, expect, it } from "vitest";
import { validateMessageRow } from "../lib/logic";
import { call, newContext, seedDevice, type TestContext } from "./helpers";

const TOKEN = "messages-token";
const CREATED_AT = "2026-11-27T09:00:00.000Z";
const UPDATED_AT = "2026-11-27T10:00:00.000Z";
const SHA = "a".repeat(64);

function attachment(overrides: Record<string, unknown> = {}) {
  return { sha256: SHA, name: "photo.png", mime: "image/png", bytes: 1024, ...overrides };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    subjectId: "subject-1",
    topicId: null,
    sender: "planner",
    text: "hello",
    attachments: [],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    deliveredAt: null,
    deletedAt: null,
    ...overrides,
  };
}

async function post(ctx: TestContext, row: Record<string, unknown>) {
  return call(ctx, "/ops", {
    method: "POST",
    token: TOKEN,
    body: { ops: [{ table: "message", row }] },
  });
}

describe("message sync", () => {
  it("upserts a valid message and returns it from /sync", async () => {
    const ctx = newContext();
    await seedDevice(ctx, TOKEN);
    const row = message({ attachments: [attachment()] });

    const response = await post(ctx, row);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 1 });

    const stored = ctx.store.getRow("message", row.id);
    expect(stored?.sender).toBe("planner");
    expect(Array.isArray(stored?.attachments)).toBe(true);
    expect(stored?.attachments).toEqual([attachment()]);
    expect(ctx.store.getChangeLog("message", row.id)).toHaveLength(1);

    const sync = await call(ctx, "/sync?since=0", { token: TOKEN });
    expect(sync.status).toBe(200);
    const body = (await sync.json()) as {
      changes: Array<{ table: string; row: { id: string } }>;
    };
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].table).toBe("message");
    expect(body.changes[0].row.id).toBe(row.id);
  });

  it("applies a newer ack and ignores an older update", async () => {
    const ctx = newContext();
    await seedDevice(ctx, TOKEN);
    const first = message({ attachments: [attachment()] });
    expect((await post(ctx, first)).status).toBe(200);

    const deliveredAt = "2026-11-27T10:05:00.000Z";
    const ack = message({
      deliveredAt,
      updatedAt: "2026-11-27T10:05:00.000Z",
    });
    const ackResponse = await post(ctx, ack);
    expect(ackResponse.status).toBe(200);
    expect(await ackResponse.json()).toMatchObject({ applied: 1 });
    expect(ctx.store.getRow("message", first.id)?.deliveredAt).toBe(deliveredAt);

    const stale = message({ text: "stale", updatedAt: "2026-11-27T09:59:00.000Z" });
    const staleResponse = await post(ctx, stale);
    expect(await staleResponse.json()).toMatchObject({ applied: 0 });
    expect(ctx.store.getRow("message", first.id)?.text).toBe("hello");
    expect(ctx.store.getRow("message", first.id)?.deliveredAt).toBe(deliveredAt);
    expect(ctx.store.getChangeLog("message", first.id)).toHaveLength(2);
  });

  it("rejects invalid rows in the validator and over /ops", async () => {
    const cases: Array<{ name: string; row: Record<string, unknown> }> = [
      { name: "bad sender", row: message({ sender: "system" }) },
      {
        name: "7 attachments",
        row: message({ attachments: Array.from({ length: 7 }, () => attachment()) }),
      },
      { name: "sha of 63 chars", row: message({ attachments: [attachment({ sha256: "a".repeat(63) })] }) },
      { name: "non-hex sha", row: message({ attachments: [attachment({ sha256: "g".repeat(64) })] }) },
      { name: "text/plain mime", row: message({ attachments: [attachment({ mime: "text/plain" })] }) },
      {
        name: "bytes over 15 MB",
        row: message({ attachments: [attachment({ bytes: 15 * 1024 * 1024 + 1 })] }),
      },
      { name: "20001 chars of text", row: message({ text: "x".repeat(20001) }) },
      { name: "empty text without attachments", row: message({ text: "", attachments: [] }) },
    ];

    for (const [index, testCase] of cases.entries()) {
      expect(validateMessageRow(testCase.row), testCase.name).toMatchObject({ ok: false });

      const ctx = newContext();
      await seedDevice(ctx, TOKEN);
      const id = `invalid-${index}`;
      const response = await post(ctx, { ...testCase.row, id });
      expect(response.status, testCase.name).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error, testCase.name).toMatch(/^message: /);
      expect(ctx.store.getRow("message", id)).toBeUndefined();
    }
  });

  it("accepts attachment-only, snake_case and maximum-size messages", async () => {
    {
      const ctx = newContext();
      await seedDevice(ctx, TOKEN); // ordinary role pushing a harness sender
      const row = message({
        id: "msg-attachment-only",
        sender: "harness",
        text: "",
        attachments: [attachment({ mime: "image/jpeg", bytes: 0 })],
      });
      const response = await post(ctx, row);
      expect(response.status).toBe(200);
      expect(ctx.store.getRow("message", row.id)?.attachments).toHaveLength(1);
    }
    {
      const ctx = newContext();
      await seedDevice(ctx, TOKEN, { role: "harness" }); // harness role pushing a planner sender
      const row = {
        id: "msg-snake",
        subjectId: null,
        topicId: null,
        sender: "planner",
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        attachments_json: [attachment({ mime: "audio/mpeg", durationSec: 12.5 })],
      };
      const response = await post(ctx, row);
      expect(response.status).toBe(200);
      expect(ctx.store.getRow("message", row.id)?.attachments).toEqual([
        { sha256: SHA, name: "photo.png", mime: "audio/mpeg", bytes: 1024, durationSec: 12.5 },
      ]);
    }
    {
      const ctx = newContext();
      await seedDevice(ctx, TOKEN);
      const row = message({
        id: "msg-max",
        text: "",
        attachments: Array.from({ length: 6 }, (_, i) =>
          attachment({ sha256: String(i).repeat(64), bytes: 15 * 1024 * 1024 }),
        ),
      });
      const response = await post(ctx, row);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: 1 });
    }

    const normalised = validateMessageRow({
      id: "msg-normalised",
      sender: "planner",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      text: "ok",
    });
    expect(normalised).toMatchObject({ ok: true, row: { text: "ok", attachments: [] } });
  });

  it("round-trips task.archivedAt and meal.createdAt through /ops and /sync", async () => {
    const ctx = newContext();
    await seedDevice(ctx, TOKEN);
    const task = {
      id: "task-archived",
      title: "Archived task",
      date: "2026-11-27",
      categoryId: null,
      parentId: null,
      seriesId: null,
      order: 0,
      done: true,
      completedAt: null,
      time: null,
      durationMin: null,
      rrule: null,
      deadline: false,
      kind: "general",
      note: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      deletedAt: null,
      archivedAt: "2026-11-27T11:00:00.000Z",
    };
    const meal = {
      id: "meal-created",
      date: "2026-11-27",
      slot: "lunch",
      label: "Salad",
      kcal: 400,
      updatedAt: UPDATED_AT,
      deletedAt: null,
      createdAt: CREATED_AT,
    };

    const response = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "task", row: task }, { table: "meal", row: meal }] },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 2 });

    expect(ctx.store.getRow("task", task.id)?.archivedAt).toBe(task.archivedAt);
    expect(ctx.store.getRow("meal", meal.id)?.createdAt).toBe(meal.createdAt);

    const sync = await call(ctx, "/sync?since=0", { token: TOKEN });
    const body = (await sync.json()) as {
      changes: Array<{ table: string; row: Record<string, unknown> }>;
    };
    expect(body.changes.find((change) => change.table === "task")?.row.archivedAt).toBe(task.archivedAt);
    expect(body.changes.find((change) => change.table === "meal")?.row.createdAt).toBe(meal.createdAt);
  });
});
