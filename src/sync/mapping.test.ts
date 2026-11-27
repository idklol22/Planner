import { describe, expect, it } from "vitest";
import { deleteCategory } from "../domain/categories";
import { defaultData, makeCalorieEntry, makeCategory, makeTask, type AppData, type CalorieEntry, type Task } from "../domain/model";
import type { CategoryRow, MealRow, TaskRow } from "../storage/hub";
import { applyRemoteRow, calorieToRow, categoryToRow, diffOps, taskToRow } from "./mapping";

const NOW = "2026-11-21T12:00:00.000Z";
const DAY = "2026-11-21";

describe("categoryToRow", () => {
  it("emits the category tombstone", () => {
    const cat = { ...makeCategory("Math", 0), deletedAt: NOW, updatedAt: NOW };
    expect(categoryToRow(cat).deletedAt).toBe(NOW);
    expect(categoryToRow(makeCategory("Live", 1)).deletedAt).toBeNull();
  });
});

describe("applyRemoteRow", () => {
  it("keeps the remote deletedAt and marks an otherwise-active category archived", () => {
    const row: CategoryRow = {
      ...categoryToRow(makeCategory("Math", 0)),
      archived: false,
      deletedAt: NOW,
    };
    const next = applyRemoteRow(defaultData(), "category", row);

    expect(next.categories).toHaveLength(1);
    expect(next.categories[0]).toMatchObject({ deletedAt: NOW, archived: true });
  });

  it("preserves the archived flag when there is no tombstone", () => {
    const row: CategoryRow = {
      ...categoryToRow(makeCategory("Old", 0)),
      archived: true,
      deletedAt: null,
    };
    const next = applyRemoteRow(defaultData(), "category", row);

    expect(next.categories[0]).toMatchObject({ archived: true });
    expect(next.categories[0].deletedAt).toBeUndefined();
  });
});

describe("diffOps", () => {
  it("emits a category op when deletedAt is set", () => {
    const cat = makeCategory("Math", 0);
    const prev = { ...defaultData(), categories: [cat] };
    const tombstoned = { ...cat, deletedAt: NOW, updatedAt: NOW };
    const next = { ...prev, categories: [tombstoned] };

    const ops = diffOps(prev, next);
    expect(ops).toEqual([{ table: "category", row: categoryToRow(tombstoned) }]);
    expect(ops[0].row.deletedAt).toBe(NOW);
  });

  it("emits one category op and one task op per tombstone for deleteCategory", () => {
    const cat = makeCategory("Math", 0);
    const top = { ...makeTask(DAY, "Top", 0), id: "top", categoryId: cat.id };
    const sub = {
      ...makeTask(DAY, "Sub", 1),
      id: "sub",
      parentId: top.id,
      categoryId: "some-other-category",
    };
    const unrelated = { ...makeTask(DAY, "Other", 2), id: "other", categoryId: null };
    const prev: AppData = { ...defaultData(), categories: [cat], tasks: [top, sub, unrelated] };

    const next = deleteCategory(prev, cat.id, NOW);
    const ops = diffOps(prev, next);

    expect(ops.filter((op) => op.table === "category")).toHaveLength(1);
    expect(ops.filter((op) => op.table === "category")[0].row.deletedAt).toBe(NOW);
    expect(ops.filter((op) => op.table === "task")).toHaveLength(2);
    expect(
      ops.filter((op) => op.table === "task").map((op) => op.row.id),
    ).toEqual(["top", "sub"]);
    // Every tombstoned task op carries the stamp; no task is reassigned to null.
    for (const op of ops.filter((op) => op.table === "task")) {
      expect((op.row as TaskRow).deletedAt).toBe(NOW);
      expect((op.row as TaskRow).categoryId).not.toBeNull();
    }
    // The unrelated task is unchanged, so diffOps emits no op for it.
    expect(ops.some((op) => op.table === "task" && op.row.id === unrelated.id)).toBe(false);
  });
});

describe("task archivedAt mapping", () => {
  const archived = (t: Task): Task => ({ ...t, archivedAt: NOW, updatedAt: NOW });

  it("taskToRow emits null when absent and the ISO string when archived", () => {
    const live = makeTask("2026-11-21", "Live", 0);
    const row: TaskRow = taskToRow(live);
    expect(row.archivedAt).toBeNull();
    expect(taskToRow(archived(live)).archivedAt).toBe(NOW);
  });

  it("applyRemoteRow maps null back to undefined and keeps a remote stamp", () => {
    const live = makeTask("2026-11-21", "Live", 0);
    const row: TaskRow = { ...taskToRow(live), archivedAt: null };
    expect(applyRemoteRow(defaultData(), "task", row).tasks[0].archivedAt).toBeUndefined();
    const remote: TaskRow = { ...row, archivedAt: NOW };
    expect(applyRemoteRow(defaultData(), "task", remote).tasks[0].archivedAt).toBe(NOW);
  });

  it("diffOps emits exactly one task op when a task is archived", () => {
    const t = makeTask("2026-11-21", "Archive me", 0);
    const prev = { ...defaultData(), tasks: [t] };
    const next = { ...prev, tasks: [archived(t)] };

    const ops = diffOps(prev, next);
    expect(ops).toEqual([{ table: "task", row: taskToRow(archived(t)) }]);
    expect(ops).toHaveLength(1);
    expect((ops[0].row as TaskRow).archivedAt).toBe(NOW);
  });
});

describe("meal createdAt mapping", () => {
  const CREATED = "2026-11-21T13:42:00.000Z";
  const UPDATED = "2026-11-22T09:15:00.000Z";

  const entry = (): CalorieEntry => ({
    ...makeCalorieEntry(DAY, 320, "Lunch"),
    id: "meal-1",
    createdAt: CREATED,
    updatedAt: UPDATED,
  });

  it("calorieToRow emits createdAt next to updatedAt", () => {
    const row = calorieToRow(entry());
    expect(row.createdAt).toBe(CREATED);
    expect(row.updatedAt).toBe(UPDATED);
  });

  it("applyRemoteRow falls back to updatedAt when a row lacks createdAt", () => {
    const base = calorieToRow(entry());
    const legacy = { ...base } as Omit<MealRow, "createdAt">;
    delete (legacy as Partial<MealRow>).createdAt;
    const next = applyRemoteRow(defaultData(), "meal", legacy as MealRow);
    expect(next.calories[0].createdAt).toBe(UPDATED);
  });

  it("applyRemoteRow uses the row's createdAt when present", () => {
    const row: MealRow = { ...calorieToRow(entry()), createdAt: CREATED };
    const next = applyRemoteRow(defaultData(), "meal", row);
    expect(next.calories[0].createdAt).toBe(CREATED);
  });

  it("applyRemoteRow preserves the local createdAt for an existing entry", () => {
    const local = entry();
    const data: AppData = { ...defaultData(), calories: [local] };
    const remote: MealRow = {
      ...calorieToRow(local),
      createdAt: UPDATED,
      updatedAt: UPDATED,
      kcal: 400,
    };
    const next = applyRemoteRow(data, "meal", remote);
    expect(next.calories[0].createdAt).toBe(CREATED);
    expect(next.calories[0].kcal).toBe(400);
  });

  it("label still round-trips for old rows", () => {
    const local = entry();
    expect(calorieToRow(local).label).toBe("Lunch");
    const remote: MealRow = { ...calorieToRow(local), createdAt: CREATED, label: "Dinner" };
    expect(applyRemoteRow(defaultData(), "meal", remote).calories[0].label).toBe("Dinner");
  });
});

describe("meal protein mapping", () => {
  const local = (): CalorieEntry => ({
    ...makeCalorieEntry(DAY, 0, undefined, 35.5),
    id: "meal-protein",
    createdAt: "2026-11-21T13:42:00.000Z",
  });

  it("calorieToRow carries protein, or null when none was logged", () => {
    expect(calorieToRow(local()).protein).toBe(35.5);
    expect(calorieToRow(makeCalorieEntry(DAY, 200)).protein).toBeNull();
  });

  it("a remote protein value replaces the local one", () => {
    const row: MealRow = { ...calorieToRow(local()), protein: 42 };
    const next = applyRemoteRow(defaultData(), "meal", row);
    expect(next.calories[0].protein).toBe(42);
  });

  it("an explicit null on a pulled row clears the local protein", () => {
    const row: MealRow = { ...calorieToRow(local()), protein: null };
    const data = { ...defaultData(), calories: [local()] };
    expect(applyRemoteRow(data, "meal", row).calories[0].protein).toBeUndefined();
  });

  it("a missing protein key keeps the local protein (old deployed hub)", () => {
    const row = { ...calorieToRow(local()) } as Partial<MealRow>;
    delete row.protein;
    const data = { ...defaultData(), calories: [local()] };
    const next = applyRemoteRow(data, "meal", row as MealRow);
    expect(next.calories[0].protein).toBe(35.5);
  });

  it("the echo of a pushed entry does not wipe its protein", () => {
    const mine = local();
    const pushed = calorieToRow(mine);
    // The deployed hub stores no protein column, so its echo has no key at all.
    const echo = { ...pushed, updatedAt: "2026-11-22T09:15:00.000Z" } as Partial<MealRow>;
    delete echo.protein;
    const next = applyRemoteRow({ ...defaultData(), calories: [mine] }, "meal", echo as MealRow);
    expect(next.calories[0]).toMatchObject({ kcal: 0, protein: 35.5 });
  });
});
