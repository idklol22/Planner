import type { ISODate } from "./dates";
import type { CategoryGoal, Habit } from "./model";
import type { Section } from "./tasks";

/** One category section for the selected day, with its habit suggestions. */
export interface DaySectionRow {
  section: Section;
  ghosts: Habit[];
}

/** Kept for callers written against the old "empty category" shape. Empty
 *  categories are no longer separated out — they have their own header and
 *  "+" in the main list — so this is always empty. */
export interface EmptyCategory {
  id: string;
  name: string;
}

export const INBOX_KEY = "__inbox";

export function sectionKey(section: Section): string {
  return section.category?.id ?? INBOX_KEY;
}

/** The visible rows, with two non-enumerable compatibility aliases. */
export type VisibleDaySections = DaySectionRow[] & {
  readonly filled: DaySectionRow[];
  readonly empty: EmptyCategory[];
};

/**
 * The day's sections, in order.
 *
 * Every active category stays visible even with no tasks: it gets a compact,
 * flat header with a "+" so a task can be added right there. Goals and habit
 * ghosts no longer decide whether a category is shown. Inbox has no category
 * of its own, so it appears only when it holds a task or a ghost, or when the
 * page has no categories at all (then it is the one list you can add to).
 *
 * The old arguments are accepted for compatibility and ignored.
 */
export function partitionDaySections(
  rows: DaySectionRow[],
  _goals: CategoryGoal[],
  _adding?: string | null,
): VisibleDaySections {
  const noCategories = rows.every((row) => !row.section.category);
  const visible = rows.filter((row) => {
    if (row.section.category) return true;
    return row.section.tasks.length > 0 || row.ghosts.length > 0 || noCategories;
  }) as VisibleDaySections;

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
