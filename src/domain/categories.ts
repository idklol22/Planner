import type { AppData } from "./model";

/** "Uncategorized" is `categoryId: null` — no record is created for it. */
export type CategoryDeleteMode = "reassign" | "delete";

/** Live tasks (open or done, top-level or subtask) carrying the category id. */
export function countCategoryTasks(data: AppData, id: string): number {
  return data.tasks.filter((t) => !t.deletedAt && t.categoryId === id).length;
}

/**
 * Soft-delete a category and clean up every reference to it. Pure: returns a
 * NEW AppData, or the very same object when the category is missing/already
 * deleted. The tombstoned category stays in `categories` so diffOps emits a
 * category op for the hub. Recurring templates follow the rule too: a
 * reassigned template materialises future occurrences with a null category,
 * a deleted template is skipped by materializeOccurrences.
 */
export function deleteCategory(
  data: AppData,
  id: string,
  mode: CategoryDeleteMode,
  now: string,
): AppData {
  const category = data.categories.find((c) => c.id === id);
  if (!category || category.deletedAt) return data;

  // Tasks whose own category is being removed; their live subtasks are caught
  // below even when the subtask has a different category (delete mode only).
  const ownedTaskIds = new Set(
    data.tasks.filter((t) => !t.deletedAt && t.categoryId === id).map((t) => t.id),
  );

  return {
    ...data,
    categories: data.categories.map((c) =>
      c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c,
    ),
    tasks: data.tasks.map((t) => {
      if (t.categoryId === id) {
        return mode === "reassign"
          ? { ...t, categoryId: null, updatedAt: now }
          : { ...t, deletedAt: now, updatedAt: now };
      }
      if (mode === "delete" && !t.deletedAt && t.parentId && ownedTaskIds.has(t.parentId)) {
        return { ...t, deletedAt: now, updatedAt: now };
      }
      return t;
    }),
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
