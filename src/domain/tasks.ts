import type { ISODate } from "./dates";
import type { Category, Task } from "./model";

export interface Section {
  /** null = tasks without a (live) category. */
  category: Category | null;
  tasks: Task[];
}

export interface DaySummary {
  total: number;
  open: number;
  done: number;
  allDone: boolean;
  /** Colour of the category with the most tasks that day (ties: first in order). */
  color: string | null;
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Top-level, non-deleted tasks on a day. */
export function tasksForDay(tasks: Task[], date: ISODate): Task[] {
  return tasks.filter((t) => t.date === date && !t.parentId && !t.deletedAt).sort(byOrder);
}

export function activeCategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => !c.archived && !c.deletedAt)
    .sort((a, b) => a.order - b.order);
}

export interface SectionOptions {
  showCompleted?: boolean;
  hideEmpty?: boolean;
}

/** Category sections for a day, in category order; uncategorised tasks last. */
export function sectionsForDay(
  tasks: Task[],
  categories: Category[],
  date: ISODate,
  { showCompleted = true, hideEmpty = false }: SectionOptions = {},
): Section[] {
  const dayTasks = tasksForDay(tasks, date);
  const live = activeCategories(categories);
  const ids = new Set(live.map((c) => c.id));
  const visible = (t: Task) => showCompleted || !t.done;
  const sections: Section[] = live.map((category) => ({
    category,
    tasks: dayTasks.filter((t) => t.categoryId === category.id && visible(t)),
  }));
  const loose = dayTasks.filter((t) => (!t.categoryId || !ids.has(t.categoryId)) && visible(t));
  if (loose.length) sections.push({ category: null, tasks: loose });
  return hideEmpty ? sections.filter((s) => s.tasks.length > 0) : sections;
}

export function daySummary(tasks: Task[], categories: Category[], date: ISODate): DaySummary {
  const day = tasksForDay(tasks, date);
  const done = day.filter((t) => t.done).length;
  const counts = new Map<string, number>();
  for (const t of day) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  let color: string | null = null;
  let best = 0;
  for (const c of activeCategories(categories)) {
    const n = counts.get(c.id) ?? 0;
    if (n > best) {
      best = n;
      color = c.color;
    }
  }
  return {
    total: day.length,
    open: day.length - done,
    done,
    allDone: day.length > 0 && done === day.length,
    color,
  };
}

/** Unfinished top-level tasks on a day, in display order. */
export function unfinishedTopLevelOn(tasks: Task[], date: ISODate): Task[] {
  return tasks
    .filter((t) => !t.deletedAt && !t.parentId && !t.done && t.date === date)
    .sort(byOrder);
}

/**
 * Move tasks (and their live subtasks) to `targetDate`, appending the moved
 * top-level tasks after everything already on that day. Pure — caller supplies
 * the ISO timestamp. Missing, deleted, subtask and already-moved ids are skipped.
 */
export function moveTasksToDay(
  tasks: Task[],
  ids: string[],
  targetDate: ISODate,
  now: string,
): { tasks: Task[]; moved: string[] } {
  const maxOrder = tasks.reduce(
    (m, t) => (t.date === targetDate && !t.deletedAt ? Math.max(m, t.order) : m),
    0,
  );
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const moved: string[] = [];
  const changed = new Map<string, Task>();

  ids.forEach((id, index) => {
    const task = byId.get(id);
    if (!task || task.deletedAt || task.parentId || task.date === targetDate) return;
    moved.push(id);
    changed.set(id, { ...task, date: targetDate, order: maxOrder + 1 + index, updatedAt: now });
    for (const sub of tasks) {
      if (sub.parentId === id && !sub.deletedAt) {
        changed.set(sub.id, { ...sub, date: targetDate, updatedAt: now });
      }
    }
  });

  return moved.length ? { tasks: tasks.map((t) => changed.get(t.id) ?? t), moved } : { tasks, moved };
}

export interface MoveToTodayResult {
  tasks: Task[];
  /** Ids of the unfinished top-level tasks that actually moved, in display order. */
  moved: string[];
  /** Original, unmodified objects for every moved parent and its live subtasks. */
  previous: Task[];
}

/**
 * Move every unfinished top-level task on `sourceDate` to `today`, together
 * with its live subtasks. Pure — the caller supplies the ISO timestamp. The
 * `previous` snapshot lets the caller undo just these tasks by id.
 */
export function moveUnfinishedToToday(
  tasks: Task[],
  sourceDate: ISODate,
  today: ISODate,
  now: string,
): MoveToTodayResult {
  const ids = unfinishedTopLevelOn(tasks, sourceDate).map((t) => t.id);
  const result = moveTasksToDay(tasks, ids, today, now);
  if (!result.moved.length) return { ...result, previous: [] };
  const moved = new Set(result.moved);
  const previous = tasks.filter(
    (t) => moved.has(t.id) || (!!t.parentId && moved.has(t.parentId) && !t.deletedAt),
  );
  return { ...result, previous };
}

/** Replace only the snapshotted ids by id; every other task is left untouched. */
export function restoreTasks(tasks: Task[], snapshot: Task[]): Task[] {
  if (!snapshot.length) return tasks;
  const byId = new Map(snapshot.map((t) => [t.id, t]));
  return tasks.map((t) => byId.get(t.id) ?? t);
}

export function subtasksOf(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parentId === parentId && !t.deletedAt).sort(byOrder);
}

export function subtaskProgress(tasks: Task[], parentId: string): { done: number; total: number } {
  const subs = subtasksOf(tasks, parentId);
  return { done: subs.filter((t) => t.done).length, total: subs.length };
}
