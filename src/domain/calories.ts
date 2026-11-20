import { addDays, type ISODate } from "./dates";
import type { CalorieEntry } from "./model";

export function entriesForDay(entries: CalorieEntry[], date: ISODate): CalorieEntry[] {
  return entries
    .filter((e) => e.date === date && !e.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Sum of live entries for a day. */
export function dayKcal(entries: CalorieEntry[], date: ISODate): number {
  return entriesForDay(entries, date).reduce((sum, e) => sum + e.kcal, 0);
}

export function hasEntries(entries: CalorieEntry[], date: ISODate): boolean {
  return entries.some((e) => e.date === date && !e.deletedAt);
}

/** Within ±10% of the goal (and something was logged). */
export function onGoal(kcal: number, goal: number): boolean {
  return goal > 0 && kcal > 0 && Math.abs(kcal - goal) <= goal * 0.1;
}

export function weekDays(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
