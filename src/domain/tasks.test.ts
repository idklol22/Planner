import { describe, expect, it } from "vitest";
import type { Note, Task } from "./model";
import { moveTasksToDay, unfinishedTopLevelOn } from "./tasks";

const DAY = "2026-03-02";
const TOMORROW = "2026-03-03";
const NOW = "2026-03-02T12:00:00.000Z";

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    date: DAY,
    categoryId: null,
    parentId: null,
    seriesId: null,
    habitId: null,
    order: 0,
    done: false,
    deadline: false,
    kind: "general",
    note: null,
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-03-01T09:00:00.000Z",
    ...extra,
  };
}

const note: Note = {
  id: "note-1",
  taskId: "parent",
  content: "keep this note",
  images: [],
  handoff: { status: "not-done" },
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-01T09:00:00.000Z",
};

describe("unfinishedTopLevelOn", () => {
  it("excludes done, subtask, deleted and other-day tasks, then sorts by order", () => {
    const tasks = [
      task("b", { order: 3 }),
      task("done", { order: 0, done: true }),
      task("sub", { order: 1, parentId: "b" }),
      task("deleted", { order: 1, deletedAt: "2026-03-02T10:00:00.000Z" }),
      task("other-day", { order: 0, date: TOMORROW }),
      task("a", { order: 1 }),
    ];

    expect(unfinishedTopLevelOn(tasks, DAY).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("moveTasksToDay", () => {
  it("moves a parent with its live subtasks, appends order, stamps updatedAt and keeps fields", () => {
    const parent = task("parent", {
      order: 1,
      categoryId: "cat-1",
      seriesId: "series-1",
      habitId: "habit-1",
      note,
      done: false,
    });
    const liveSub = task("live-sub", { parentId: "parent", order: 2 });
    const deletedSub = task("deleted-sub", {
      parentId: "parent",
      order: 4,
      deletedAt: "2026-03-02T10:00:00.000Z",
    });
    const otherDay = task("other-day", { date: "2026-03-04", order: 1 });
    const alreadyThere = task("already-there", { date: TOMORROW, order: 5 });
    const input = [parent, liveSub, deletedSub, otherDay, alreadyThere];

    const result = moveTasksToDay(input, ["parent"], TOMORROW, NOW);

    expect(result.moved).toEqual(["parent"]);
    const movedParent = result.tasks.find((t) => t.id === "parent")!;
    expect(movedParent).toEqual({
      ...parent,
      date: TOMORROW,
      order: 6, // max order on target (5) + 1 + index (0)
      updatedAt: NOW,
    });
    expect(movedParent.categoryId).toBe("cat-1");
    expect(movedParent.seriesId).toBe("series-1");
    expect(movedParent.habitId).toBe("habit-1");
    expect(movedParent.note).toBe(note);
    expect(movedParent.done).toBe(false);
    expect(movedParent.parentId).toBeNull();

    const movedSub = result.tasks.find((t) => t.id === "live-sub")!;
    expect(movedSub.date).toBe(TOMORROW);
    expect(movedSub.order).toBe(2); // subtasks keep their own order
    expect(movedSub.parentId).toBe("parent");
    expect(movedSub.updatedAt).toBe(NOW);

    expect(result.tasks.find((t) => t.id === "deleted-sub")).toBe(deletedSub);
    expect(result.tasks.find((t) => t.id === "other-day")).toBe(otherDay);
    expect(result.tasks.find((t) => t.id === "already-there")).toBe(alreadyThere);
    expect(input.find((t) => t.id === "parent")).toBe(parent); // pure
  });

  it("appends multiple moved tasks in id order", () => {
    const a = task("a", { order: 0 });
    const b = task("b", { order: 1 });
    const input = [a, b, task("target", { date: TOMORROW, order: 4 })];

    const result = moveTasksToDay(input, ["a", "b"], TOMORROW, NOW);

    expect(result.moved).toEqual(["a", "b"]);
    expect(result.tasks.find((t) => t.id === "a")!.order).toBe(5);
    expect(result.tasks.find((t) => t.id === "b")!.order).toBe(6);
  });

  it("ignores ids already on the target date and ids that do not exist", () => {
    const already = task("already", { date: TOMORROW, order: 0 });
    const source = task("source", { date: DAY });
    const input = [already, source];

    const result = moveTasksToDay(input, ["already", "missing"], TOMORROW, NOW);

    expect(result.moved).toEqual([]);
    expect(result.tasks).toBe(input);
    expect(result.tasks.find((t) => t.id === "source")).toBe(source);
  });
});
