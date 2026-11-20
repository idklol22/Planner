import type { CategoryGoal } from "./model";

const live = (g: CategoryGoal) => !g.deletedAt;
const byOrder = (a: CategoryGoal, b: CategoryGoal) => a.order - b.order;

/** Open (not yet achieved) goals of a category, in order. */
export function openGoals(goals: CategoryGoal[], categoryId: string | null): CategoryGoal[] {
  if (!categoryId) return [];
  return goals.filter((g) => live(g) && g.categoryId === categoryId && !g.achievedAt).sort(byOrder);
}

/** Achieved goals of a category, most recently achieved first. */
export function achievedGoals(goals: CategoryGoal[], categoryId: string | null): CategoryGoal[] {
  if (!categoryId) return [];
  return goals
    .filter((g) => live(g) && g.categoryId === categoryId && !!g.achievedAt)
    .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));
}

/** New order values for a category's open goals after moving `id` to `toIndex`. Returns ids in the new order. */
export function reorderedIds(open: CategoryGoal[], id: string, toIndex: number): string[] {
  const ids = open.map((g) => g.id);
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
  return ids;
}
