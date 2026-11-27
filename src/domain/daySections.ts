import type { CategoryGoal, Habit } from "./model";
import type { Section } from "./tasks";

/** One category section for the selected day, with its habit suggestions. */
export interface DaySectionRow {
  section: Section;
  ghosts: Habit[];
}

/** Kept for callers written against the old "empty category" shape. There are
 *  no longer any empty-category rows: a list with nothing in it is not shown. */
export interface EmptyCategory {
  id: string;
  name: string;
}

export const INBOX_KEY = "__inbox";

export function sectionKey(section: Section): string {
  return section.category?.id ?? INBOX_KEY;
}

/** The shape returned by `partitionDaySections`: the visible rows, with two
 *  non-enumerable compatibility aliases (an old `{ filled, empty }` caller
 *  keeps working; `empty` is always empty now). */
export type VisibleDaySections = DaySectionRow[] & {
  readonly filled: DaySectionRow[];
  readonly empty: EmptyCategory[];
};

/**
 * The day's visible sections, in order. A category counts as visible when it
 * has a task, a habit ghost or a live goal (open or achieved). Inbox is only
 * shown when it actually has content. Empty categories are simply not shown —
 * adding happens through the one composer, never through a per-list add row.
 *
 * The old third argument (the id of an open inline input) is accepted for
 * compatibility but ignored: the inline inputs no longer exist.
 */
export function partitionDaySections(
  rows: DaySectionRow[],
  goals: CategoryGoal[],
  _adding?: string | null,
): VisibleDaySections {
  const goalCategories = new Set(goals.filter((g) => !g.deletedAt).map((g) => g.categoryId));
  const filled: DaySectionRow[] = [];

  for (const row of rows) {
    const cat = row.section.category;
    if (!cat) {
      // Inbox only renders when there is something to put in it.
      if (row.section.tasks.length || row.ghosts.length) filled.push(row);
      continue;
    }
    if (
      row.section.tasks.length > 0 ||
      row.ghosts.length > 0 ||
      goalCategories.has(cat.id)
    ) {
      filled.push(row);
    }
  }

  const visible = filled as VisibleDaySections;
  Object.defineProperties(visible, {
    filled: { value: visible, enumerable: false },
    empty: { value: [] as EmptyCategory[], enumerable: false },
  });
  return visible;
}

/** Aliases for call sites that prefer to name what they get back. */
export const visibleDaySections = partitionDaySections;
export const visibleSections = partitionDaySections;
export const sectionsWithContent = partitionDaySections;
