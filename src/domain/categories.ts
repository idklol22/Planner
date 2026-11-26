import type { AppData } from "./model";

/**
 * Every live task that goes away when a category is deleted: tasks owned by
 * the category plus all live descendants reachable through `parentId` (a
 * child may live in a different category). Already-deleted tasks are never
 * included, so they are never re-tombstoned. Pure.
 */
export function categoryTaskIds(data: AppData, id: string): Set<string> {
  const byParent = new Map<string | null, typeof data.tasks>();
  for (const task of data.tasks) {
    if (task.deletedAt) continue;
    const siblings = byParent.get(task.parentId);
    if (siblings) siblings.push(task);
    else byParent.set(task.parentId, [task]);
  }

  const ids = new Set<string>();
  const visit = (task: (typeof data.tasks)[number]) => {
    if (ids.has(task.id)) return;
    ids.add(task.id);
    for (const child of byParent.get(task.id) ?? []) visit(child);
  };
  // Owned = every live task carrying the category id, at any depth. Walk each
  // one's live descendants so cross-category children and deeper subtasks go too.
  for (const task of data.tasks) {
    if (!task.deletedAt && task.categoryId === id) visit(task);
  }
  return ids;
}

/** Live tasks (open or done, top-level or subtask) that a delete tombstones. */
export function countCategoryTasks(data: AppData, id: string): number {
  return categoryTaskIds(data, id).size;
}

/**
 * Soft-delete a category and clean up every reference to it. Pure: returns a
 * NEW AppData, or the very same object when the category is missing/already
 * deleted. The tombstoned category stays in `categories` so diffOps emits a
 * category op for the hub. Recurring templates follow the rule too: deleting
 * a template stops future materialised occurrences from being created.
 */
export function deleteCategory(data: AppData, id: string, now: string): AppData {
  const category = data.categories.find((c) => c.id === id);
  if (!category || category.deletedAt) return data;

  const taskIds = categoryTaskIds(data, id);
  return {
    ...data,
    categories: data.categories.map((c) =>
      c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c,
    ),
    tasks: data.tasks.map((t) =>
      taskIds.has(t.id) ? { ...t, deletedAt: now, updatedAt: now } : t,
    ),
    goals: data.goals.map((g) =>
      g.categoryId === id ? { ...g, deletedAt: now, updatedAt: now } : g,
    ),
    habits: data.habits.map((h) =>
      h.categoryId === id ? { ...h, categoryId: null, updatedAt: now } : h,
    ),
    settings:
      data.settings.letcodeCategoryId === id
        ? { ...data.settings, letcodeCategoryId: undefined }
        : data.settings,
  };
}
