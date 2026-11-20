import { fromISODate, type ISODate } from "./dates";
import { uid } from "./ids";
import type { Task } from "./model";

/** rrule strings: "daily" | "weekdays" | "weekly" | "days:1,3,5" (0 = Sunday). */
export const REPEAT_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Every week" },
] as const;

export function parseDays(rrule: string): number[] {
  if (!rrule.startsWith("days:")) return [];
  return rrule
    .slice(5)
    .split(",")
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** Does a template that starts on `start` occur on `date`? */
export function ruleMatches(rrule: string, start: ISODate, date: ISODate): boolean {
  if (date < start) return false;
  const weekday = fromISODate(date).getDay();
  if (rrule === "daily") return true;
  if (rrule === "weekdays") return weekday >= 1 && weekday <= 5;
  if (rrule === "weekly") return weekday === fromISODate(start).getDay();
  return parseDays(rrule).includes(weekday);
}

/** Occurrences missing for the given days. Pure and idempotent: feed the result
 *  back into `tasks` and a second call returns []. Soft-deleted occurrences still
 *  count as present, so deleting one day's copy does not resurrect it. */
export function materializeOccurrences(
  tasks: Task[],
  dates: ISODate[],
  now: string = new Date().toISOString(),
): Task[] {
  const templates = tasks.filter((t) => t.rrule && !t.parentId && !t.seriesId && !t.deletedAt);
  if (!templates.length) return [];
  const existing = new Set(tasks.filter((t) => t.seriesId).map((t) => `${t.seriesId}|${t.date}`));
  const out: Task[] = [];
  for (const template of templates) {
    for (const date of dates) {
      if (date === template.date) continue; // the template is its own occurrence
      if (!ruleMatches(template.rrule!, template.date, date)) continue;
      const key = `${template.id}|${date}`;
      if (existing.has(key)) continue;
      existing.add(key);
      out.push({
        id: uid("task"),
        title: template.title,
        date,
        categoryId: template.categoryId,
        parentId: null,
        seriesId: template.id,
        order: template.order,
        done: false,
        time: template.time,
        durationMin: template.durationMin,
        deadline: template.deadline,
        kind: template.kind,
        note: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return out;
}
