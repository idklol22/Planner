import { describe, expect, it } from "vitest";
import { categoryTaskIds, countCategoryTasks, deleteCategory } from "./categories";
import {
  defaultData,
  makeCalorieEntry,
  makeCategory,
  makeGoal,
  makeHabit,
  makeTask,
  type AppData,
  type Category,
  type Task,
} from "./model";

const NOW = "2026-11-21T12:00:00.000Z";
const OLD = "2026-01-01T00:00:00.000Z";
const DAY = "2026-11-21";

function fixture() {
  const cat = makeCategory("Math", 0);
  const other = makeCategory("Physics", 1);

  // A tree that spans categories: the child and grandchild of an owned task
  // live in a different category but must still go away with the parent.
  const top = { ...makeTask(DAY, "Top", 0), id: "top", categoryId: cat.id };
  const done = { ...makeTask(DAY, "Done", 1), id: "done", categoryId: cat.id, done: true };
  const sub = { ...makeTask(DAY, "Sub", 2), id: "sub", parentId: "top", categoryId: cat.id };
  const cross = {
    ...makeTask(DAY, "Cross", 3),
    id: "cross",
    parentId: "sub",
    categoryId: other.id,
  };
  const grandchild = {
    ...makeTask(DAY, "Grandchild", 4),
    id: "grandchild",
    parentId: "cross",
    categoryId: other.id,
  };
  const template = {
    ...makeTask(DAY, "Template", 5),
    id: "template",
    categoryId: cat.id,
    rrule: "daily",
  };
  const occurrence = {
    ...makeTask(DAY, "Occurrence", 6),
    id: "occurrence",
    categoryId: cat.id,
    seriesId: "template",
  };
  const alreadyDeleted = {
    ...makeTask(DAY, "Already deleted", 7),
    id: "already-deleted",
    categoryId: cat.id,
    deletedAt: OLD,
  };
  const unrelated = { ...makeTask(DAY, "Other", 8), id: "other", categoryId: other.id };

  const tasks: Task[] = [
    top,
    done,
    sub,
    cross,
    grandchild,
    template,
    occurrence,
    alreadyDeleted,
    unrelated,
  ];
  const data: AppData = { ...defaultData(), categories: [cat, other], tasks };
  return {
    cat,
    other,
    top,
    done,
    sub,
    cross,
    grandchild,
    template,
    occurrence,
    alreadyDeleted,
    unrelated,
    data,
    tasks,
    // Every live task that a delete must tombstone (the already-deleted one is excluded).
    tombstonedIds: [
      "top",
      "done",
      "sub",
      "cross",
      "grandchild",
      "template",
      "occurrence",
    ],
  };
}

describe("deleteCategory — always deletes its tasks", () => {
  it("tombstones the category and every owned task, descendant, template and occurrence", () => {
    const { cat, other, data, tombstonedIds, unrelated, alreadyDeleted } = fixture();
    const next = deleteCategory(data, cat.id, NOW);

    expect(next).not.toBe(data);
    expect(next.categories.find((c) => c.id === cat.id)).toMatchObject({
      deletedAt: NOW,
      updatedAt: NOW,
      archived: false,
      name: cat.name,
      color: cat.color,
    });
    expect(next.categories.find((c) => c.id === other.id)).toBe(other);

    for (const id of tombstonedIds) {
      expect(next.tasks.find((t) => t.id === id)).toMatchObject({
        deletedAt: NOW,
        updatedAt: NOW,
      });
    }
    // Already-deleted tasks are never re-tombstoned; unrelated tasks are untouched.
    expect(next.tasks.find((t) => t.id === alreadyDeleted.id)).toBe(alreadyDeleted);
    expect(next.tasks.find((t) => t.id === unrelated.id)).toBe(unrelated);
    expect(next.tasks.find((t) => t.id === unrelated.id)?.deletedAt).toBeUndefined();
    expect(next.tasks.map((t) => t.id)).toEqual(data.tasks.map((t) => t.id));
  });

  it("keeps task fields and order intact while stamping the tombstone", () => {
    const { cat, top, cross, data } = fixture();
    const next = deleteCategory(data, cat.id, NOW);

    const nTop = next.tasks.find((t) => t.id === top.id)!;
    expect(nTop).toMatchObject({
      title: top.title,
      date: top.date,
      categoryId: top.categoryId,
      parentId: top.parentId,
      order: top.order,
      done: top.done,
      deletedAt: NOW,
      updatedAt: NOW,
    });
    // A cross-category child keeps its own categoryId; it is deleted, not reassigned.
    expect(next.tasks.find((t) => t.id === cross.id)).toMatchObject({
      categoryId: cross.categoryId,
      deletedAt: NOW,
    });
  });

  it("soft-deletes goals, unlinks habits and clears the LetCode setting, never touching calories", () => {
    const { cat, other, data } = fixture();
    const goal = { ...makeGoal(cat.id, "Goal", 0), id: "goal" };
    const otherGoal = { ...makeGoal(other.id, "Other goal", 0), id: "other-goal" };
    const habit = { ...makeHabit("Habit", cat.id, DAY), id: "habit" };
    const otherHabit = { ...makeHabit("Other", other.id, DAY), id: "other-habit" };
    const calories = [makeCalorieEntry(DAY, 550, "lunch")];
    const full: AppData = {
      ...data,
      goals: [goal, otherGoal],
      habits: [habit, otherHabit],
      calories,
      settings: { ...data.settings, letcodeCategoryId: cat.id },
    };

    const next = deleteCategory(full, cat.id, NOW);

    expect(next.goals.find((g) => g.id === goal.id)).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
    expect(next.goals.find((g) => g.id === otherGoal.id)).toBe(otherGoal);
    expect(next.habits.find((h) => h.id === habit.id)).toMatchObject({
      categoryId: null,
      updatedAt: NOW,
      title: habit.title,
    });
    expect(next.habits.find((h) => h.id === habit.id)?.deletedAt).toBeUndefined();
    expect(next.habits.find((h) => h.id === otherHabit.id)).toBe(otherHabit);
    expect(next.settings.letcodeCategoryId).toBeUndefined();
    expect(next.calories).toBe(calories);
    expect(next.settings.dailyCalorieGoal).toBe(full.settings.dailyCalorieGoal);
  });

  it("returns the same object for a missing or already-deleted category", () => {
    const { cat, data } = fixture();
    expect(deleteCategory(data, "missing", NOW)).toBe(data);

    const tombstoned: Category = { ...cat, deletedAt: OLD };
    const already: AppData = { ...data, categories: [tombstoned] };
    expect(deleteCategory(already, cat.id, NOW)).toBe(already);
  });

  it("can delete an archived category and its tasks", () => {
    const { cat, data } = fixture();
    const archived: AppData = {
      ...data,
      categories: data.categories.map((c) => (c.id === cat.id ? { ...c, archived: true } : c)),
    };
    const next = deleteCategory(archived, cat.id, NOW);

    expect(next.categories.find((c) => c.id === cat.id)).toMatchObject({
      archived: true,
      deletedAt: NOW,
      updatedAt: NOW,
    });
    for (const id of fixture().tombstonedIds) {
      expect(next.tasks.find((t) => t.id === id)?.deletedAt).toBe(NOW);
    }
    // No live task is merely uncategorised; the deleted ones keep their ids.
    expect(next.tasks.some((t) => t.categoryId === cat.id && !t.deletedAt)).toBe(false);
    expect(next.tasks.map((t) => t.id)).toEqual(archived.tasks.map((t) => t.id));
  });
});

describe("categoryTaskIds / countCategoryTasks", () => {
  it("counts and collects every task the delete would tombstone", () => {
    const { cat, other, data, tombstonedIds } = fixture();
    const ids = categoryTaskIds(data, cat.id);

    expect([...ids].sort()).toEqual([...tombstonedIds].sort());
    expect(ids.size).toBe(tombstonedIds.length);
    expect(countCategoryTasks(data, cat.id)).toBe(tombstonedIds.length);
    // `other` owns cross, grandchild and unrelated: three live tasks. The
    // cross-category child/grandchild are also reached from `sub` above.
    expect(countCategoryTasks(data, other.id)).toBe(3);
  });

  it("excludes already-deleted tasks and is stable with the tombstone set", () => {
    const { cat, data } = fixture();
    expect(categoryTaskIds(data, cat.id).has("already-deleted")).toBe(false);
    expect(countCategoryTasks(data, cat.id)).toBe(7);

    const next = deleteCategory(data, cat.id, NOW);
    // The count still describes what would be tombstoned: no live owned tasks remain.
    expect(countCategoryTasks(next, cat.id)).toBe(0);
    expect(categoryTaskIds(next, cat.id).size).toBe(0);
  });

  it("returns zero for a missing category", () => {
    const { data } = fixture();
    expect(categoryTaskIds(data, "missing").size).toBe(0);
    expect(countCategoryTasks(data, "missing")).toBe(0);
  });

  it("owns a live task whose parent lives in another category, plus its descendants", () => {
    const { cat, other, data } = fixture();
    const foreignParent = {
      ...makeTask(DAY, "Foreign parent", 9),
      id: "foreign-parent",
      categoryId: other.id,
    };
    const ownedChild = {
      ...makeTask(DAY, "Owned child", 10),
      id: "owned-child",
      parentId: "foreign-parent",
      categoryId: cat.id,
    };
    const grandchild = {
      ...makeTask(DAY, "Owned grandchild", 11),
      id: "owned-grandchild",
      parentId: "owned-child",
      categoryId: other.id,
    };
    const full: AppData = {
      ...data,
      tasks: [...data.tasks, foreignParent, ownedChild, grandchild],
    };

    const ids = categoryTaskIds(full, cat.id);
    // The foreign parent is not owned and not a descendant of an owned task.
    expect(ids.has("foreign-parent")).toBe(false);
    expect(ids.has("owned-child")).toBe(true);
    expect(ids.has("owned-grandchild")).toBe(true);

    const next = deleteCategory(full, cat.id, NOW);
    expect(next.tasks.find((t) => t.id === "foreign-parent")).toBe(foreignParent);
    expect(next.tasks.find((t) => t.id === "owned-child")).toMatchObject({ deletedAt: NOW });
    expect(next.tasks.find((t) => t.id === "owned-grandchild")).toMatchObject({ deletedAt: NOW });
  });
});
