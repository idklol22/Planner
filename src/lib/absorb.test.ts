import { describe, expect, it } from "vitest";
import type { Task } from "../domain/model";
import { itemsFromDeadlines, parseNoteItems, similarTitles, tasksForItems, taskCountMessage } from "./absorb";

const task = (over: Partial<Task>): Task => ({
  id: "t1",
  title: "Lab assignment",
  date: "2026-11-21",
  categoryId: "cat_1",
  parentId: null,
  order: 0,
  done: false,
  deadline: false,
  kind: "class",
  note: null,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
  ...over,
});

const items = parseNoteItems([
  { title: "Lab assignment", kind: "assignment", date: "2026-11-21", time: "17:00" },
  { title: "End sem", kind: "exam", date: "2026-11-29" },
  { title: "Bad", kind: "exam", date: "tomorrow" },
]);

describe("tasksForItems", () => {
  it("creates study deadline tasks with their time, and drops malformed items", () => {
    expect(tasksForItems([], "cat_1", items)).toEqual([
      { title: "Lab assignment", date: "2026-11-21", time: "17:00", kind: "study", deadline: true },
      { title: "End sem", date: "2026-11-29", kind: "study", deadline: true },
    ]);
  });

  it("skips an item when the category already has a similar task that day", () => {
    const specs = tasksForItems([task({ title: "Lab assignments (OS)" })], "cat_1", items);
    expect(specs.map((s) => s.title)).toEqual(["End sem"]);
    // another category, another date, or a deleted task do not count
    expect(tasksForItems([task({ categoryId: "cat_2" })], "cat_1", items)).toHaveLength(2);
    expect(tasksForItems([task({ date: "2026-11-22" })], "cat_1", items)).toHaveLength(2);
    expect(tasksForItems([task({ deletedAt: "2026-11-20T00:00:00.000Z" })], "cat_1", items)).toHaveLength(2);
  });

  it("uses a class task for items that are neither assignment, exam nor quiz", () => {
    const [spec] = tasksForItems([], "cat_1", parseNoteItems([{ title: "Guest talk", kind: "other", date: "2026-11-25" }]));
    expect(spec).toMatchObject({ kind: "class", deadline: false });
  });
});

describe("helpers", () => {
  it("compares titles by token overlap", () => {
    expect(similarTitles("End sem exam", "End sem")).toBe(true);
    expect(similarTitles("Quiz one", "Quiz two")).toBe(false);
  });
  it("turns hub deadlines into items and words the toast", () => {
    expect(itemsFromDeadlines([{ title: "End sem", due: "2026-11-29T09:00", kind: "exam", done: false }, { title: "Old", due: "2026-11-01", kind: "quiz", done: true }]))
      .toEqual([{ title: "End sem", kind: "exam", date: "2026-11-29", time: "09:00" }]);
    expect(taskCountMessage(2)).toBe("Added 2 tasks from your note");
    expect(taskCountMessage(1)).toBe("Added 1 task from your note");
  });
});
