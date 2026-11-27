/** Pure helpers shared by the `/widget` routes: validation, token creation and
 * the live widget view builder. No storage or HTTP dependencies live here. */

import type {
  CategoryRow,
  HealthRow,
  HealthWorkout,
  MealRow,
  TaskRow,
} from "./db.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const WIDGET_MEAL_RE = /^wcal_[A-Za-z0-9-]{8,64}$/;

/** Maximum number of considered task rows a single widget view may use. */
export const MAX_WIDGET_TASKS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A local calendar day, including a real month/day combination. */
export function isWidgetDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_RE.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

/** Compare ISO timestamps, falling back to lexical order for unusual values. */
export function compareIsoTimes(a: unknown, b: unknown): number {
  const left = String(a ?? "");
  const right = String(b ?? "");
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs - rightMs;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** `at`, or 1 ms past `rowUpdatedAt` when the stored row is at/after `at`.
 * With `strictlyAfter` equality also advances (used for deletions). */
export function nextUpdatedAt(
  rowUpdatedAt: string,
  at: string,
  strictlyAfter = false,
): string {
  const newer = strictlyAfter
    ? compareIsoTimes(rowUpdatedAt, at) >= 0
    : compareIsoTimes(rowUpdatedAt, at) > 0;
  if (!newer) return at;
  const ms = Date.parse(rowUpdatedAt);
  return Number.isFinite(ms) ? new Date(ms + 1).toISOString() : `${rowUpdatedAt}_1`;
}

/** 32 random bytes, lowercase hex — the cleartext widget token. */
export function newWidgetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ── Health rows ──────────────────────────────────────────────────────────────

export type HealthValidation =
  | { ok: true; row: HealthRow }
  | { ok: false; error: string };

/** Validate (and fill defaults for) a health sync row. */
export function validateHealthRow(value: unknown): HealthValidation {
  if (!isRecord(value)) return { ok: false, error: "row must be an object" };
  if (!isWidgetDate(value.date)) return { ok: false, error: "date must be YYYY-MM-DD" };
  const date = value.date;
  if (value.id !== `health_${date}`) {
    return { ok: false, error: "id must be health_<date>" };
  }
  if (typeof value.updatedAt !== "string" || value.updatedAt === "") {
    return { ok: false, error: "updatedAt must be a non-empty string" };
  }

  const number = (name: string, max: number, integer = false): number | null => {
    const raw = value[name];
    if (raw === undefined || raw === null) return null;
    if (
      typeof raw !== "number" ||
      !Number.isFinite(raw) ||
      raw < 0 ||
      raw > max ||
      (integer && !Number.isInteger(raw))
    ) {
      throw new Error(
        `${name} must be ${integer ? "an integer" : "a number"} between 0 and ${max} or null`,
      );
    }
    return raw;
  };

  let activeKcal: number | null;
  let steps: number | null;
  let exerciseMin: number | null;
  let distanceKm: number | null;
  let sleepHours: number | null;
  let restingHr: number | null;
  try {
    activeKcal = number("activeKcal", 50000);
    steps = number("steps", 1000000, true);
    exerciseMin = number("exerciseMin", 1440);
    distanceKm = number("distanceKm", 1000);
    sleepHours = number("sleepHours", 24);
    restingHr = number("restingHr", 400);
  } catch (caught) {
    return { ok: false, error: (caught as Error).message };
  }

  const rawWorkouts = value.workouts === undefined || value.workouts === null
    ? []
    : value.workouts;
  if (!Array.isArray(rawWorkouts)) {
    return { ok: false, error: "workouts must be an array" };
  }
  if (rawWorkouts.length > 50) {
    return { ok: false, error: "workouts must have at most 50 entries" };
  }
  const workouts: HealthWorkout[] = [];
  for (const item of rawWorkouts) {
    if (!isRecord(item)) return { ok: false, error: "each workout must be an object" };
    if (typeof item.type !== "string" || item.type === "") {
      return { ok: false, error: "workout type must be a non-empty string" };
    }
    if (
      typeof item.minutes !== "number" ||
      !Number.isFinite(item.minutes) ||
      item.minutes < 0
    ) {
      return { ok: false, error: "workout minutes must be a finite non-negative number" };
    }
    let kcal: number | null = null;
    if (item.kcal !== undefined && item.kcal !== null) {
      if (
        typeof item.kcal !== "number" ||
        !Number.isFinite(item.kcal) ||
        item.kcal < 0
      ) {
        return { ok: false, error: "workout kcal must be a finite non-negative number or null" };
      }
      kcal = item.kcal;
    }
    workouts.push({ type: item.type, minutes: item.minutes, kcal });
  }

  const source = value.source === undefined || value.source === null ? null : value.source;
  if (source !== null && source !== "healthkit" && source !== "shortcut") {
    return { ok: false, error: "source must be 'healthkit' or 'shortcut'" };
  }
  const deletedAt = value.deletedAt === undefined || value.deletedAt === null
    ? null
    : value.deletedAt;
  if (deletedAt !== null && typeof deletedAt !== "string") {
    return { ok: false, error: "deletedAt must be a string or null" };
  }

  return {
    ok: true,
    row: {
      id: value.id as string,
      date,
      activeKcal,
      steps,
      exerciseMin,
      distanceKm,
      sleepHours,
      restingHr,
      workouts,
      source: source as "healthkit" | "shortcut" | null,
      updatedAt: value.updatedAt,
      deletedAt: deletedAt as string | null,
    },
  };
}

// ── Widget profile ───────────────────────────────────────────────────────────

export type ProfileValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

const THEME_KEYS = [
  "bg",
  "surface",
  "text",
  "muted",
  "faint",
  "accent",
  "accentContrast",
];

/** Validate a PUT /widget/profile body. The accepted object is stored as is. */
export function validateWidgetProfile(value: unknown): ProfileValidation {
  if (!isRecord(value)) return { ok: false, error: "profile must be an object" };

  const goal = value.calorieGoal;
  if (
    typeof goal !== "number" ||
    !Number.isFinite(goal) ||
    goal < 0 ||
    goal > 100000
  ) {
    return { ok: false, error: "calorieGoal must be between 0 and 100000" };
  }

  if (!isRecord(value.theme)) return { ok: false, error: "theme must be an object" };
  for (const key of THEME_KEYS) {
    if (typeof value.theme[key] !== "string") {
      return { ok: false, error: `theme.${key} must be a string` };
    }
  }
  if (typeof value.theme.dark !== "boolean") {
    return { ok: false, error: "theme.dark must be a boolean" };
  }

  if (!Array.isArray(value.goals)) return { ok: false, error: "goals must be an array" };
  if (value.goals.length > 500) {
    return { ok: false, error: "goals must have at most 500 entries" };
  }
  for (const item of value.goals) {
    if (!isRecord(item)) return { ok: false, error: "each goal must be an object" };
    for (const key of ["id", "categoryId", "title"]) {
      if (typeof item[key] !== "string") {
        return { ok: false, error: `goal.${key} must be a string` };
      }
    }
    if (typeof item.done !== "boolean") {
      return { ok: false, error: "goal.done must be a boolean" };
    }
    if (typeof item.order !== "number" || !Number.isFinite(item.order)) {
      return { ok: false, error: "goal.order must be a finite number" };
    }
  }

  return { ok: true, data: value };
}

// ── Widget actions ───────────────────────────────────────────────────────────

export type WidgetAction =
  | { type: "task.set_done"; taskId: string; done: boolean; at: string }
  | { type: "calories.add"; id: string; kcal: number; date: string; at: string }
  | { type: "calories.remove"; id: string; at: string };

export type ActionValidation =
  | { ok: true; action: WidgetAction }
  | { ok: false; error: string };

/** Shape validation only; existence and staleness are checked by the router. */
export function validateWidgetAction(value: unknown): ActionValidation {
  if (!isRecord(value)) return { ok: false, error: "action must be an object" };

  if (value.type === "task.set_done") {
    if (typeof value.taskId !== "string" || value.taskId === "") {
      return { ok: false, error: "taskId must be a non-empty string" };
    }
    if (typeof value.done !== "boolean") {
      return { ok: false, error: "done must be a boolean" };
    }
    if (!isIsoTimestamp(value.at)) return { ok: false, error: "at must be an ISO timestamp" };
    return {
      ok: true,
      action: { type: "task.set_done", taskId: value.taskId, done: value.done, at: value.at },
    };
  }

  if (value.type === "calories.add") {
    if (typeof value.id !== "string" || !WIDGET_MEAL_RE.test(value.id)) {
      return { ok: false, error: "id must be wcal_ followed by 8-64 letters, digits or dashes" };
    }
    if (
      typeof value.kcal !== "number" ||
      !Number.isInteger(value.kcal) ||
      value.kcal < 1 ||
      value.kcal > 10000
    ) {
      return { ok: false, error: "kcal must be an integer between 1 and 10000" };
    }
    if (!isWidgetDate(value.date)) return { ok: false, error: "date must be YYYY-MM-DD" };
    if (!isIsoTimestamp(value.at)) return { ok: false, error: "at must be an ISO timestamp" };
    return {
      ok: true,
      action: {
        type: "calories.add",
        id: value.id,
        kcal: value.kcal,
        date: value.date,
        at: value.at,
      },
    };
  }

  if (value.type === "calories.remove") {
    if (typeof value.id !== "string" || !WIDGET_MEAL_RE.test(value.id)) {
      return { ok: false, error: "id must be wcal_ followed by 8-64 letters, digits or dashes" };
    }
    if (!isIsoTimestamp(value.at)) return { ok: false, error: "at must be an ISO timestamp" };
    return { ok: true, action: { type: "calories.remove", id: value.id, at: value.at } };
  }

  return { ok: false, error: "unknown action type" };
}

// ── Widget view ──────────────────────────────────────────────────────────────

export interface WidgetViewInput {
  date: string;
  generatedAt: string;
  profile: Record<string, unknown> | null;
  categories: CategoryRow[];
  meals: MealRow[];
  tasks: TaskRow[];
  health: HealthRow | null;
}

/** Build the JSON document returned by GET /widget. */
export function buildWidgetView(input: WidgetViewInput): Record<string, unknown> {
  const { date, generatedAt, profile, categories, meals, tasks, health } = input;

  const goals = Array.isArray(profile?.goals)
    ? (profile.goals as unknown[]).filter(isRecord)
    : [];
  const theme = isRecord(profile?.theme) ? profile.theme : null;
  const calorieGoal =
    typeof profile?.calorieGoal === "number" && Number.isFinite(profile.calorieGoal)
      ? profile.calorieGoal
      : null;

  const dayMeals = meals.filter(
    (meal) =>
      meal.date === date &&
      (meal.deletedAt === null || meal.deletedAt === undefined),
  );
  const eaten = dayMeals.reduce(
    (sum, meal) => sum + (typeof meal.kcal === "number" && Number.isFinite(meal.kcal) ? meal.kcal : 0),
    0,
  );
  let lastWidgetEntry: { id: string; kcal: number; at: string } | null = null;
  for (const meal of dayMeals) {
    if (typeof meal.id !== "string" || !meal.id.startsWith("wcal_")) continue;
    const at = String(meal.createdAt ?? meal.updatedAt ?? "");
    if (!lastWidgetEntry || compareIsoTimes(at, lastWidgetEntry.at) > 0) {
      lastWidgetEntry = { id: meal.id, kcal: Number(meal.kcal) || 0, at };
    }
  }

  const burned =
    health && !health.deletedAt && typeof health.activeKcal === "number"
      ? health.activeKcal
      : null;
  const steps =
    health && !health.deletedAt && typeof health.steps === "number"
      ? health.steps
      : null;

  const categoryViews = [...categories]
    .filter((category) => !category.deletedAt && !category.archived)
    .sort(
      (a, b) =>
        Number(a.order) - Number(b.order) || String(a.id).localeCompare(String(b.id)),
    )
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      order: Number(category.order) || 0,
      goals: goals
        .filter((goal) => goal.categoryId === category.id)
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((goal) => ({ title: String(goal.title ?? ""), done: Boolean(goal.done) })),
    }));

  const considered = tasks.filter(
    (task) =>
      (task.deletedAt === null || task.deletedAt === undefined) &&
      (task.archivedAt === null || task.archivedAt === undefined) &&
      (!task.done || String(task.date) >= date),
  );
  const taskViews = considered
    .filter((task) => task.parentId === null || task.parentId === undefined)
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        Number(a.order) - Number(b.order) ||
        String(a.id).localeCompare(String(b.id)),
    )
    .map((task) => {
      const subtasks = considered.filter((row) => row.parentId === task.id);
      return {
        id: task.id,
        title: task.title,
        date: task.date,
        done: Boolean(task.done),
        categoryId: task.categoryId ?? null,
        seriesId: task.seriesId || (task.rrule ? task.id : null),
        time: task.time ?? null,
        deadline: Boolean(task.deadline),
        order: Number(task.order) || 0,
        subtasksDone: subtasks.filter((row) => Boolean(row.done)).length,
        subtasksTotal: subtasks.length,
      };
    });

  return {
    date,
    generatedAt,
    theme,
    calories: { eaten, goal: calorieGoal, lastWidgetEntry, burned, steps },
    categories: categoryViews,
    tasks: taskViews,
  };
}
