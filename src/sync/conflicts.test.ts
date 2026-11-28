import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryRow, TaskRow } from "../storage/hub";
import {
  CONFLICTS_KEY,
  describeConflicts,
  LocalConflictStore,
  MAX_CONFLICTS,
  sameRowContent,
  type ConflictInput,
} from "./conflicts";

const T0 = "2026-11-20T09:00:00.000Z";
const T1 = "2026-11-20T10:00:00.000Z";
const T2 = "2026-11-20T11:00:00.000Z";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    has: (key: string) => data.has(key),
  };
}

function task(id: string, updatedAt = T1, title = `Task ${id}`): TaskRow {
  return {
    id,
    title,
    date: "2026-11-20",
    categoryId: null,
    parentId: null,
    seriesId: null,
    order: 0,
    done: false,
    completedAt: null,
    time: null,
    durationMin: null,
    rrule: null,
    deadline: false,
    kind: "general",
    note: null,
    createdAt: T0,
    updatedAt,
    deletedAt: null,
    archivedAt: null,
  };
}

function loss(row: TaskRow, reason: ConflictInput["reason"] = "superseded"): ConflictInput {
  return { table: "task", row, reason };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("conflict copies", () => {
  it("stores the rejected row verbatim under its own key", () => {
    const storage = memoryStorage();
    const store = new LocalConflictStore(storage);
    const rejected = task("a", T1, "My edit");

    store.save([loss(rejected)], T2);

    expect(storage.getItem(CONFLICTS_KEY)).toBeTruthy();
    expect(store.all()).toEqual([
      { table: "task", row: rejected, savedAt: T2, reason: "superseded" },
    ]);
    expect(JSON.parse(storage.getItem(CONFLICTS_KEY) ?? "[]")[0].row).toEqual(rejected);
  });

  it("deduplicates by table+id and keeps the newest version", () => {
    const store = new LocalConflictStore();
    store.save([loss(task("a", T1, "first")), loss(task("a", T2, "second"))]);
    store.save([loss(task("a", T1, "older repeat"))], "2026-11-21T00:00:00.000Z");

    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].row).toMatchObject({ title: "older repeat" });
    expect(store.all()[0].savedAt).toBe("2026-11-21T00:00:00.000Z");
  });

  it("keeps only the newest 50 copies", () => {
    const store = new LocalConflictStore();
    store.save(
      Array.from({ length: 60 }, (_, i) => loss(task(`t${i}`, T1, `title ${i}`))),
      T1,
    );

    const all = store.all();
    expect(all).toHaveLength(MAX_CONFLICTS);
    expect(all[0].row.id).toBe("t10");
    expect(all[all.length - 1].row.id).toBe("t59");
  });

  it("ignores corrupt or partial stored copies", () => {
    localStorage.setItem(CONFLICTS_KEY, "{not json");
    expect(new LocalConflictStore().all()).toEqual([]);
    localStorage.setItem(
      CONFLICTS_KEY,
      JSON.stringify([{ table: "task", row: { id: "x" } }, { ...loss(task("ok")), savedAt: T2 }]),
    );
    expect(new LocalConflictStore().all().map((r) => r.row.id)).toEqual(["ok"]);
  });

  it("compares content without the last-write-wins stamp", () => {
    const sent = task("a", T1, "same");
    const repeat = task("a", T2, "same");
    const changed = task("a", T2, "different");
    expect(sameRowContent(sent, repeat)).toBe(true);
    expect(sameRowContent(sent, changed)).toBe(false);

    const withNote = (noteStamp: string) => ({
      ...task("n", T1),
      note: { content: "hello", updatedAt: noteStamp },
    });
    expect(sameRowContent(withNote(T1), withNote(T2))).toBe(true);

    const category: CategoryRow = {
      id: "c", name: "X", color: "#fff", icon: null, order: 0,
      linkedSubjectId: null, archived: false, createdAt: T0, updatedAt: T1, deletedAt: null,
    };
    expect(sameRowContent(category, { ...category, updatedAt: T2 })).toBe(true);
  });

  it("names at most two items and says the copy was kept", () => {
    const message = describeConflicts([
      { ...loss(task("a", T1, "Write a report")), savedAt: T2 },
      { ...loss(task("b", T1, "Call Sam")), savedAt: T2 },
      { ...loss(task("c", T1, "Third")), savedAt: T2 },
    ]);
    expect(message).toContain("Write a report");
    expect(message).toContain("Call Sam");
    expect(message).not.toContain("Third");
    expect(message).toContain("and 1 more");
    expect(message).toContain("newer version exists on another device");
    expect(message).toContain("A copy was kept");
  });

  it("does not claim a newer version when the winner is unknown", () => {
    const message = describeConflicts([
      { ...loss(task("a"), "unconfirmed"), savedAt: T2 },
    ]);
    expect(message).toContain("A copy was kept");
    expect(message).not.toContain("newer version");
  });
});
