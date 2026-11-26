/** Pure translation between the Planner's local data and hub rows.
 *
 *  Synced: category, task, meal (= local calorie entries). `goal` has no local
 *  model (the daily calorie goal lives in settings without a timestamp), and
 *  habits are not in the hub contract, so both stay local-only.
 *  Fields the hub row does not carry (task.habitId, category.linkedTopicId,
 *  meal slot) are preserved from the local copy when a remote row is applied. */

import type { AppData, CalorieEntry, Category, Task } from "../domain/model";
import type {
  CategoryRow,
  HDeadlineRow,
  HMaterialRow,
  HSubjectRow,
  HTopicRow,
  HubOp,
  MealRow,
  MirrorRow,
  MirrorTable,
  PullRow,
  PullTable,
  SyncRow,
  SyncTable,
  TaskRow,
} from "../storage/hub";
import { isMirrorTable } from "../storage/hub";

export function categoryToRow(c: Category): CategoryRow {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon ?? null,
    order: c.order,
    linkedSubjectId: c.linkedSubjectId,
    archived: c.archived,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt ?? null,
  };
}

export function taskToRow(t: Task): TaskRow {
  return {
    id: t.id,
    title: t.title,
    date: t.date,
    categoryId: t.categoryId,
    parentId: t.parentId,
    seriesId: t.seriesId ?? null,
    order: t.order,
    done: t.done,
    completedAt: t.completedAt ?? null,
    time: t.time ?? null,
    durationMin: t.durationMin ?? null,
    rrule: t.rrule ?? null,
    deadline: t.deadline,
    kind: t.kind,
    note: t.note ? { ...t.note } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    deletedAt: t.deletedAt ?? null,
    archivedAt: t.archivedAt ?? null,
  };
}

export function calorieToRow(c: CalorieEntry): MealRow {
  return {
    id: c.id,
    date: c.date,
    slot: "",
    label: c.label ?? "",
    kcal: c.kcal,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt ?? null,
  };
}

/** The hub row for a local record, or null when it is not there. */
export function getLocalRow(data: AppData, table: PullTable, id: string): PullRow | null {
  switch (table) {
    case "category": {
      const c = data.categories.find((x) => x.id === id);
      return c ? categoryToRow(c) : null;
    }
    case "task": {
      const t = data.tasks.find((x) => x.id === id);
      return t ? taskToRow(t) : null;
    }
    case "meal": {
      const c = data.calories.find((x) => x.id === id);
      return c ? calorieToRow(c) : null;
    }
    default:
      return null;
  }
}

/** Every synced record as an op (used to seed the outbox on first connect). */
export function allOps(data: AppData): HubOp[] {
  return [
    ...data.categories.map((c) => ({ table: "category" as const, row: categoryToRow(c) })),
    ...data.tasks.map((t) => ({ table: "task" as const, row: taskToRow(t) })),
    ...data.calories.map((c) => ({ table: "meal" as const, row: calorieToRow(c) })),
  ];
}

/** Ops for every record that is new or is a different object than in `prev`.
 *  Store mutators replace changed records, so reference inequality is enough. */
export function diffOps(prev: AppData, next: AppData): HubOp[] {
  const ops: HubOp[] = [];
  const prevCat = new Map(prev.categories.map((c) => [c.id, c]));
  for (const c of next.categories) {
    if (prevCat.get(c.id) !== c) ops.push({ table: "category", row: categoryToRow(c) });
  }
  const prevTask = new Map(prev.tasks.map((t) => [t.id, t]));
  for (const t of next.tasks) {
    if (prevTask.get(t.id) !== t) ops.push({ table: "task", row: taskToRow(t) });
  }
  const prevCal = new Map(prev.calories.map((c) => [c.id, c]));
  for (const c of next.calories) {
    if (prevCal.get(c.id) !== c) ops.push({ table: "meal", row: calorieToRow(c) });
  }
  return ops;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const copy = list.slice();
  copy[index] = item;
  return copy;
}

/** Merge one remote row into local data. Returns `data` unchanged for tables
 *  that have no local model (goal) or for unknown shapes. */
export function applyRemoteRow(data: AppData, table: SyncTable, row: SyncRow): AppData {
  switch (table) {
    case "category": {
      const r = row as CategoryRow;
      const old = data.categories.find((x) => x.id === r.id);
      const next: Category = {
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon ?? undefined,
        order: r.order,
        linkedSubjectId: r.linkedSubjectId ?? null,
        linkedTopicId: old?.linkedTopicId ?? null,
        archived: Boolean(r.archived) || Boolean(r.deletedAt),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt ?? undefined,
      };
      return { ...data, categories: upsert(data.categories, next) };
    }
    case "task": {
      const r = row as TaskRow;
      const old = data.tasks.find((x) => x.id === r.id);
      const next: Task = {
        id: r.id,
        title: r.title,
        date: r.date,
        categoryId: r.categoryId,
        parentId: r.parentId,
        seriesId: r.seriesId,
        habitId: old?.habitId ?? null,
        order: r.order,
        done: r.done,
        completedAt: r.completedAt ?? undefined,
        time: r.time ?? undefined,
        durationMin: r.durationMin ?? undefined,
        rrule: r.rrule ?? undefined,
        deadline: r.deadline,
        kind: r.kind,
        note: r.note ? (r.note as unknown as Task["note"]) : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt ?? undefined,
        archivedAt: r.archivedAt ?? undefined,
      };
      return { ...data, tasks: upsert(data.tasks, next) };
    }
    case "meal": {
      const r = row as MealRow;
      const next: CalorieEntry = {
        id: r.id,
        date: r.date,
        kcal: r.kcal,
        label: r.label || undefined,
        createdAt: r.updatedAt,
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt ?? undefined,
      };
      const old = data.calories.find((x) => x.id === r.id);
      if (old) next.createdAt = old.createdAt;
      return { ...data, calories: upsert(data.calories, next) };
    }
    default:
      return data;
  }
}

// ── Read-only Harness mirror ────────────────────────────────────────────────

export interface Mirror {
  subjects: HSubjectRow[];
  topics: HTopicRow[];
  materials: HMaterialRow[];
  deadlines: HDeadlineRow[];
}

export const emptyMirror = (): Mirror => ({ subjects: [], topics: [], materials: [], deadlines: [] });

const MIRROR_KEYS: Record<MirrorTable, keyof Mirror> = {
  h_subject: "subjects",
  h_topic: "topics",
  h_material: "materials",
  h_deadline: "deadlines",
};

export function getMirrorRow(mirror: Mirror, table: MirrorTable, id: string): MirrorRow | null {
  const list = mirror[MIRROR_KEYS[table]] as MirrorRow[];
  return list.find((x) => x.id === id) ?? null;
}

/** Upsert a mirror row; tombstoned rows are removed. */
export function applyMirrorRow(mirror: Mirror, table: MirrorTable, row: MirrorRow): Mirror {
  const key = MIRROR_KEYS[table];
  const list = (mirror[key] as MirrorRow[]).filter((x) => x.id !== row.id);
  if (!row.deletedAt) list.push(row);
  return { ...mirror, [key]: list } as Mirror;
}

export { isMirrorTable };
