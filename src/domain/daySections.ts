import type { CategoryGoal, Habit } from "./model";
import type { Section } from "./tasks";

/** One category section for the selected day, with its habit suggestions. */
export interface DaySectionRow {
  section: Section;
  ghosts: Habit[];
}

/** A category with nothing on the day: shown as one quiet text button instead of a block. */
export interface EmptyCategory {
  id: string;
  name: string;
}

export const INBOX_KEY = "__inbox";

export function sectionKey(section: Section): string {
  return section.category?.id ?? INBOX_KEY;
}

/**
 * Split the day's sections into full blocks and the leftover empty categories.
 * A category counts as full when it has a visible task, a habit ghost, a live
 * goal (open or achieved) or an inline input open on it. Inbox is never listed
 * as an empty category: it is only ever shown when it has content.
 */
export function partitionDaySections(
  rows: DaySectionRow[],
  goals: CategoryGoal[],
  adding: string | null,
): { filled: DaySectionRow[]; empty: EmptyCategory[] } {
  const goalCategories = new Set(goals.filter((g) => !g.deletedAt).map((g) => g.categoryId));
  const filled: DaySectionRow[] = [];
  const empty: EmptyCategory[] = [];

  for (const row of rows) {
    const cat = row.section.category;
    if (!cat) {
      // Inbox only renders when there is something to put in it.
      if (row.section.tasks.length || row.ghosts.length || adding === INBOX_KEY) filled.push(row);
      continue;
    }
    const occupied =
      row.section.tasks.length > 0 ||
      row.ghosts.length > 0 ||
      goalCategories.has(cat.id) ||
      adding === cat.id;
    if (occupied) filled.push(row);
    else empty.push({ id: cat.id, name: cat.name });
  }

  return { filled, empty };
}
