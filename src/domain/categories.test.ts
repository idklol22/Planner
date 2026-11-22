import { describe, expect, it } from "vitest";
import { countCategoryTasks, deleteCategory } from "./categories";
import {
  defaultData,
  makeCalorieEntry,
  makeCategory,
  makeGoal,
  makeHabit,
  makeTask,
  type AppData,
  type Category,
} from "./model";

const NOW = "2026-11-21T12:00:00.000Z";
const DAY = "2026-11-21";

function fixture() {
  const cat = makeCategory("Math", 0);
  const other = makeCategory("Physics", 1);
  const top = { ...makeTask(DAY, "Top", 0), id: "top", categoryId: cat.id };
  const sub = { ...makeTask(DAY, "Sub", 1), id: "sub", parentId: "top", categoryId: cat.id };
  const unrelated = { ...makeTask(DAY, "Other", 2), id: "other", categoryId: other.id };
  const data: AppData = {
    ...defaultData(),
    categories: [cat, other],
    tasks: [top, sub, unrelated],
  };
  return { cat, other, top, sub, unrelated, data };
}

describe("deleteCategory — reassign", () => {
  it("tombstones the category and clears categoryId on own tasks, preserving fields and order", () => {
    const { cat, other, top, sub, unrelated, data } = fixture();
    const next = deleteCategory(data, cat.id, "reassign", NOW);

    expect(next).not.toBe(data);
    expect(next.categories.find((c) => c.id === cat.id)).toMatchObject({
      deletedAt: NOW,
      updatedAt: NOW,
      archived: false,
      name: cat.name,
      color: cat.color,
    });
    expect(next.categories.find((c) => c.id === other.id)).toBe(other);

    const nTop = next.tasks.find((t) => t.id === top.id)!;
    expect(nTop.categoryId).toBeNull();
    expect(nTop.updatedAt).toBe(NOW);
    expect(nTop.title).toBe(top.title);
    expect(nTop.order).toBe(top.order);
    expect(nTop.date).toBe(top.date);
    expect(nTop.parentId).toBe(top.parentId);

    expect(next.tasks.find((t) => t.id === sub.id)?.categoryId).toBeNull();
    expect(next.tasks.find((t) => t.id === sub.id)?.deletedAt).toBeUndefined();
    expect(next.tasks.find((t) => t.id === unrelated.id)).toBe(unrelated);
    expect(next.tasks.map((t) => t.id)).toEqual(["top", "sub", "other"]);
  });

  it("soft-deletes goals, clears habit categories and the LetCode setting", () => {
    const { cat, other, data } = fixture();
    const goal = { ...makeGoal(cat.id, "Goal", 0), id: "goal" };
    const habit = { ...makeHabit("Habit", cat.id, DAY), id: "habit" };
    const otherHabit = { ...makeHabit("Other", other.id, DAY), id: "other-habit" };
    const full: AppData = {
      ...data,
      goals: [goal],
      habits: [habit, otherHabit],
      settings: { ...data.settings, letcodeCategoryId: cat.id },
    };

    const next = deleteCategory(full, cat.id, "reassign", NOW);

    expect(next.goals[0]).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
    expect(next.habits.find((h) => h.id === habit.id)).toMatchObject({
      categoryId: null,
      updatedAt: NOW,
    });
    expect(next.habits.find((h) => h.id === otherHabit.id)).toBe(otherHabit);
    expect(next.settings.letcodeCategoryId).toBeUndefined();
  });
});

describe("deleteCategory — delete", () => {
  it("soft-deletes own tasks and their subtasks, leaving unrelated tasks untouched", () => {
    const { cat, other, top, unrelated, data } = fixture();
    // Subtask may belong to a different category; it still goes when its parent goes.
    const sub: AppData["tasks"][number] = {
      ...makeTask(DAY, "Sub", 1),
      id: "sub",
      parentId: top.id,
      categoryId: other.id,
    };
    const full: AppData = { ...data, tasks: [top, sub, unrelated] };

    const next = deleteCategory(full, cat.id, "delete", NOW);

    expect(next.tasks.find((t) => t.id === top.id)).toMatchObject({
      deletedAt: NOW,
      updatedAt: NOW,
    });
    expect(next.tasks.find((t) => t.id === sub.id)).toMatchObject({
      deletedAt: NOW,
      updatedAt: NOW,
    });
    expect(next.tasks.find((t) => t.id === unrelated.id)).toBe(unrelated);
    expect(next.tasks.find((t) => t.id === unrelated.id)?.deletedAt).toBeUndefined();
  });

  it("leaves no live reference to the deleted id and never touches calories", () => {
    const { cat, other, data } = fixture();
    const goal = { ...makeGoal(cat.id, "Goal", 0), id: "goal" };
    const habit = { ...makeHabit("Habit", cat.id, DAY), id: "habit" };
    const calories = [makeCalorieEntry(DAY, 550, "lunch")];
    const full: AppData = { ...data, goals: [goal], habits: [habit], calories };

    for (const mode of ["reassign", "delete"] as const) {
      const next = deleteCategory(full, cat.id, mode, NOW);
      expect(next.tasks.some((t) => t.categoryId === cat.id && !t.deletedAt)).toBe(false);
      expect(next.goals.some((g) => g.categoryId === cat.id && !g.deletedAt)).toBe(false);
      expect(next.habits.some((h) => h.categoryId === cat.id)).toBe(false);
      expect(next.calories).toBe(calories);
      expect(next.settings.dailyCalorieGoal).toBe(full.settings.dailyCalorieGoal);
      expect(other.name).toBe("Physics");
    }
  });
});

describe("deleteCategory — no-ops and archived categories", () => {
  it("returns the same object for a missing or already-deleted category", () => {
    const { cat, data } = fixture();
    expect(deleteCategory(data, "missing", "reassign", NOW)).toBe(data);

    const tombstoned: Category = { ...cat, deletedAt: "2026-01-01T00:00:00.000Z" };
    const already: AppData = { ...data, categories: [tombstoned] };
    expect(deleteCategory(already, cat.id, "delete", NOW)).toBe(already);
  });

  it("can delete an archived category", () => {
    const { cat, data } = fixture();
    const archived: AppData = {
      ...data,
      categories: data.categories.map((c) => (c.id === cat.id ? { ...c, archived: true } : c)),
    };
    const next = deleteCategory(archived, cat.id, "reassign", NOW);

    expect(next.categories.find((c) => c.id === cat.id)).toMatchObject({
      archived: true,
      deletedAt: NOW,
    });
    expect(next.tasks.every((t) => t.categoryId !== cat.id)).toBe(true);
  });
});

describe("countCategoryTasks", () => {
  it("counts live tasks only, including subtasks and done tasks", () => {
    const { cat, other, data } = fixture();
    const done = { ...makeTask(DAY, "Done", 3), id: "done", categoryId: cat.id, done: true };
    const deleted = {
      ...makeTask(DAY, "Deleted", 4),
      id: "deleted",
      categoryId: cat.id,
      deletedAt: "2026-01-01T00:00:00.000Z",
    };
    const full: AppData = { ...data, tasks: [...data.tasks, done, deleted] };

    // top + sub + done; the deleted one is excluded.
    expect(countCategoryTasks(full, cat.id)).toBe(3);
    expect(countCategoryTasks(full, other.id)).toBe(1);
    expect(countCategoryTasks(full, "missing")).toBe(0);
  });
});
