import type { ISODate } from "./dates";
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

/** Which way the day list enters: later days from the right, earlier from the left. */
export type DayDirection = "next" | "prev" | null;

export function daySlideDirection(previous: ISODate | null, next: ISODate): DayDirection {
  if (!previous || previous === next) return null;
  return next > previous ? "next" : "prev";
}

/** One row in a list that can enter, leave and glide to a new position. */
export interface MotionRowData<T> {
  item: T;
  /** False while the data is gone but the row is still animating out. */
  present: boolean;
  /** True only for rows that were not in the previous layout. */
  entering: boolean;
}

/**
 * Merge the live rows with the copies of rows that were just removed, keeping
 * each leaving row in its old slot so the space closes where the row used to
 * be. `previousOrder` is the last rendered order, leaving rows included.
 */
export function mergeMotionRows<T extends { id: string }>(
  current: readonly T[],
  stale: readonly T[],
  previousOrder: readonly string[],
  enteringIds: ReadonlySet<string>,
): MotionRowData<T>[] {
  const liveIds = new Set(current.map((item) => item.id));
  const staleById = new Map(stale.filter((item) => !liveIds.has(item.id)).map((item) => [item.id, item]));
  const previousIndex = new Map(previousOrder.map((id, index) => [id, index]));

  // A leaving row stays right after the last live row that preceded it.
  const leavingByAnchor = new Map<string | null, T[]>();
  staleById.forEach((item, id) => {
    const at = previousIndex.get(id);
    let anchor: string | null = null;
    if (at !== undefined) {
      for (let i = at - 1; i >= 0; i--) {
        if (liveIds.has(previousOrder[i])) {
          anchor = previousOrder[i];
          break;
        }
      }
    }
    const bucket = leavingByAnchor.get(anchor) ?? [];
    bucket.push(item);
    leavingByAnchor.set(anchor, bucket);
  });

  const rows: MotionRowData<T>[] = [];
  const appendLeaving = (anchor: string | null) => {
    for (const item of leavingByAnchor.get(anchor) ?? []) {
      rows.push({ item, present: false, entering: false });
    }
  };
  appendLeaving(null);
  for (const item of current) {
    rows.push({ item, present: true, entering: enteringIds.has(item.id) });
    appendLeaving(item.id);
  }
  return rows;
}
