/** Pure calendar-day presentation rules, kept out of the component so they can be tested. */

export type DayMark = "none" | "open" | "done";

/** One mark per day: a filled muted dot for open tasks, a faint outline when every task is done, nothing otherwise. */
export function dayMark(total: number, done: number): DayMark {
  if (total <= 0) return "none";
  return done >= total ? "done" : "open";
}

/** The day's accessible name always carries its open-task count. */
export function dayAriaLabel(name: string, total: number, done: number): string {
  if (total <= 0) return name;
  const open = Math.max(0, total - done);
  return `${name}, ${open} open, ${done} of ${total} done`;
}
