import { addDays, type ISODate } from "./dates";
import { dayKcal, hasEntries, onGoal } from "./calories";
import type { CalorieEntry, Category, Task } from "./model";
import { tasksForDay } from "./tasks";

export interface CategoryCount {
  category: Category | null;
  done: number;
  total: number;
}

export interface DaySummaryCard {
  date: ISODate;
  done: number;
  total: number;
  kcal: number;
  goal: number;
  /** Categories that had at least one task done (the ones "worked on"). */
  worked: CategoryCount[];
}

export interface WeekSummaryCard {
  start: ISODate;
  done: number;
  total: number;
  /** Average over days that have calorie entries (0 when none). */
  kcalAverage: number;
  daysLogged: number;
  daysOnGoal: number;
  goal: number;
  perCategory: CategoryCount[];
}

function countByCategory(tasks: Task[], categories: Category[]): CategoryCount[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const map = new Map<string, CategoryCount>();
  for (const t of tasks) {
    const category = t.categoryId ? (byId.get(t.categoryId) ?? null) : null;
    const key = category?.id ?? "__none";
    const row = map.get(key) ?? { category, done: 0, total: 0 };
    row.total += 1;
    if (t.done) row.done += 1;
    map.set(key, row);
  }
  const order = (c: CategoryCount) => c.category?.order ?? Number.MAX_SAFE_INTEGER;
  return [...map.values()].sort((a, b) => order(a) - order(b));
}

export function daySummary(
  date: ISODate,
  tasks: Task[],
  categories: Category[],
  calories: CalorieEntry[],
  goal: number,
): DaySummaryCard {
  const day = tasksForDay(tasks, date);
  return {
    date,
    done: day.filter((t) => t.done).length,
    total: day.length,
    kcal: dayKcal(calories, date),
    goal,
    worked: countByCategory(day, categories).filter((c) => c.done > 0),
  };
}

/** Seven days from `start` (inclusive). */
export function weekSummary(
  start: ISODate,
  tasks: Task[],
  categories: Category[],
  calories: CalorieEntry[],
  goal: number,
): WeekSummaryCard {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const all = days.flatMap((d) => tasksForDay(tasks, d));
  const logged = days.filter((d) => hasEntries(calories, d));
  const totals = logged.map((d) => dayKcal(calories, d));
  return {
    start,
    done: all.filter((t) => t.done).length,
    total: all.length,
    kcalAverage: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
    daysLogged: logged.length,
    daysOnGoal: totals.filter((k) => onGoal(k, goal)).length,
    goal,
    perCategory: countByCategory(all, categories),
  };
}
