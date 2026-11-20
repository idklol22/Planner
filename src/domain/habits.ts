import { fromISODate, type ISODate } from "./dates";
import type { Habit, Task } from "./model";

/** Does the habit's schedule include this day? (ignores whether it was already added) */
export function habitApplies(habit: Habit, date: ISODate): boolean {
  if (habit.deletedAt) return false;
  if (date < habit.startDate) return false;
  if (habit.endDate && date > habit.endDate) return false;
  const days = habit.weekdays;
  if (days && days.length > 0 && !days.includes(fromISODate(date).getDay())) return false;
  return true;
}

/**
 * Ghost suggestions for a day: habits that apply and have not become a real task
 * (a live task with `habitId` = habit.id on that date) yet. Nothing is stored for ghosts.
 */
export function ghostsFor(date: ISODate, habits: Habit[], tasks: Task[]): Habit[] {
  const taken = new Set(
    tasks.filter((t) => t.date === date && t.habitId && !t.deletedAt).map((t) => t.habitId),
  );
  return habits
    .filter((h) => habitApplies(h, date) && !taken.has(h.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day", "Mon, Wed, Fri" (+ end date when set). */
export function describeSchedule(habit: Habit): string {
  const days = habit.weekdays ?? [];
  const base =
    days.length === 0 || days.length === 7
      ? "Every day"
      : [...days]
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
          .map((d) => NAMES[d])
          .join(", ");
  return habit.endDate ? `${base} until ${habit.endDate}` : base;
}
