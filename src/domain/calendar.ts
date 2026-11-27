import type { ISODate } from "./dates";
import type { Category, Task } from "./model";
import { tasksForDay } from "./tasks";

/** One task of a day as the calendar draws it. `color` is null for uncategorised tasks. */
export interface DayTile {
  id: string;
  color: string | null;
  done: boolean;
}

export interface DayTiles {
  /** At most `max` tiles: finished ones first (they sit at the bottom), then by category order. */
  tiles: DayTile[];
  /** Tasks that did not fit. */
  more: number;
  total: number;
  done: number;
}

/** The tiles for a calendar day. When tasks overflow, one slot is left for the "+n" count and open
 *  tasks are kept in view ahead of finished ones. */
export function dayTiles(tasks: Task[], categories: Category[], date: ISODate, max: number): DayTiles {
  const order = new Map(categories.map((c) => [c.id, c.order]));
  const colors = new Map(categories.filter((c) => !c.deletedAt).map((c) => [c.id, c.color]));
  const day = tasksForDay(tasks, date);
  const rank = (t: Task) => (t.categoryId ? (order.get(t.categoryId) ?? 999) : 999);
  const sorted = [...day].sort((a, b) => Number(b.done) - Number(a.done) || rank(a) - rank(b));
  const done = day.filter((t) => t.done).length;
  const room = day.length > max ? Math.max(max - 1, 0) : max;
  // Drop finished tasks first when there is not room for everything.
  const kept = sorted.slice(Math.min(Math.max(sorted.length - room, 0), done));
  const shown = kept.slice(0, room);
  return {
    tiles: shown.map((t) => ({
      id: t.id,
      color: t.categoryId ? (colors.get(t.categoryId) ?? null) : null,
      done: t.done,
    })),
    more: day.length - shown.length,
    total: day.length,
    done,
  };
}
