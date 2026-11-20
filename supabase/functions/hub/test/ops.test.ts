import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, type TestContext } from "./helpers";

const ctx: TestContext = newContext();
const TOKEN = "ops-token";
const ID = "cat-lww";

function category(name: string, updatedAt: string) {
  return {
    id: ID,
    name,
    color: "#ff0000",
    icon: "star",
    order: 1,
    linkedSubjectId: null,
    archived: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt,
    deletedAt: null,
  };
}

beforeAll(async () => {
  await seedDevice(ctx, TOKEN);
});

describe("POST /ops", () => {
  it("upserts rows, ignores older updates and logs only applied rows", async () => {
    const first = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("first", "2026-11-01T10:00:00.000Z") }] },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { applied: number; cursor: number };
    expect(firstBody.applied).toBe(1);
    expect(firstBody.cursor).toBeGreaterThan(0);

    const older = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("stale", "2026-11-01T09:00:00.000Z") }] },
    });
    expect(await older.json()).toMatchObject({ applied: 0, cursor: firstBody.cursor });

    const newer = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("newest", "2026-11-01T11:00:00.000Z") }] },
    });
    const newerBody = (await newer.json()) as { applied: number; cursor: number };
    expect(newerBody.applied).toBe(1);
    expect(newerBody.cursor).toBeGreaterThan(firstBody.cursor);

    expect(ctx.store.getRow("category", ID)).toMatchObject({
      name: "newest",
      updatedAt: "2026-11-01T11:00:00.000Z",
    });
    expect(ctx.store.getChangeLog("category", ID)).toHaveLength(2);
  });

  it("stores task notes as JSON and round-trips booleans", async () => {
    const task = {
      id: "task-note-1",
      title: "Read chapter",
      date: "2026-11-20",
      categoryId: null,
      parentId: null,
      seriesId: null,
      order: 0,
      done: true,
      completedAt: "2026-11-20T08:00:00.000Z",
      time: null,
      durationMin: null,
      rrule: null,
      deadline: false,
      kind: "study",
      note: { content: "**hi**", images: [] },
      createdAt: "2026-11-20T07:00:00.000Z",
      updatedAt: "2026-11-20T08:00:00.000Z",
      deletedAt: null,
    };
    const response = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "task", row: task }] },
    });
    expect(response.status).toBe(200);

    expect(ctx.store.getRow("task", task.id)).toMatchObject({
      note: task.note,
      done: true,
      deadline: false,
    });
  });

  it("rejects unsupported tables", async () => {
    const response = await call(ctx, "/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "habit", row: { id: "x", updatedAt: "now" } }] },
    });
    expect(response.status).toBe(400);
  });
});
