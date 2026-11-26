import { describe, expect, it } from "vitest";
import { defaultData, makeCategory, makeTask, type Task } from "../domain/model";
import type { CategoryRow, TaskRow } from "../storage/hub";
import { applyRemoteRow, categoryToRow, diffOps, taskToRow } from "./mapping";

const NOW = "2026-11-21T12:00:00.000Z";

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
