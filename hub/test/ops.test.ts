import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { call, seedDevice } from "./helpers";

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
  await seedDevice(TOKEN);
});

describe("POST /ops", () => {
  it("upserts rows, ignores older updates and logs only applied rows", async () => {
    const first = await call("/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("first", "2026-11-01T10:00:00.000Z") }] },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { applied: number; cursor: number };
    expect(firstBody.applied).toBe(1);
    expect(firstBody.cursor).toBeGreaterThan(0);

    const older = await call("/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("stale", "2026-11-01T09:00:00.000Z") }] },
    });
    expect(await older.json()).toMatchObject({ applied: 0, cursor: firstBody.cursor });

    const newer = await call("/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "category", row: category("newest", "2026-11-01T11:00:00.000Z") }] },
    });
    const newerBody = (await newer.json()) as { applied: number; cursor: number };
    expect(newerBody.applied).toBe(1);
    expect(newerBody.cursor).toBeGreaterThan(firstBody.cursor);

    const stored = await env.DB.prepare("SELECT name, updated_at FROM category WHERE id = ?")
      .bind(ID)
      .first<{ name: string; updated_at: string }>();
    expect(stored).toMatchObject({
      name: "newest",
      updated_at: "2026-11-01T11:00:00.000Z",
    });

    const logs = await env.DB.prepare(
      "SELECT seq FROM change_log WHERE table_name = 'category' AND row_id = ?",
    )
      .bind(ID)
      .all();
    expect(logs.results).toHaveLength(2);
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
    const response = await call("/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "task", row: task }] },
    });
    expect(response.status).toBe(200);

    const raw = await env.DB.prepare("SELECT note_json, done, deadline FROM task WHERE id = ?")
      .bind(task.id)
      .first<{ note_json: string; done: number; deadline: number }>();
    expect(JSON.parse(raw!.note_json)).toEqual(task.note);
    expect(raw!.done).toBe(1);
    expect(raw!.deadline).toBe(0);
  });

  it("rejects unsupported tables", async () => {
    const response = await call("/ops", {
      method: "POST",
      token: TOKEN,
      body: { ops: [{ table: "habit", row: { id: "x", updatedAt: "now" } }] },
    });
    expect(response.status).toBe(400);
  });
});
