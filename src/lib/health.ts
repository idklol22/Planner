/** Pure helpers for per-day Apple Health data and `planner://health` links. */

import { formatDay, fromISODate, toISODate, type ISODate } from "../domain/dates";
import type { HealthRow, HealthWorkout } from "../storage/hub";

export const HEALTH_KEY = "planner.health.v1";
export const HEALTH_CONNECTED_KEY = "planner.health.connected.v1";
export const HEALTH_DAYS = 7;

/** Numeric fields carried by a health day. */
export const HEALTH_FIELDS = [
  "activeKcal",
  "steps",
  "exerciseMin",
  "distanceKm",
  "sleepHours",
  "restingHr",
] as const;

export type HealthField = (typeof HEALTH_FIELDS)[number];

/** Upper bounds from the hub contract; lower bound is always zero. */
export const HEALTH_LIMITS: Record<HealthField, number> = {
  activeKcal: 50_000,
  steps: 1_000_000,
  exerciseMin: 1_440,
  distanceKm: 1_000,
  sleepHours: 24,
  restingHr: 400,
};

export interface HealthValues {
  activeKcal?: number | null;
  steps?: number | null;
  exerciseMin?: number | null;
  distanceKm?: number | null;
  sleepHours?: number | null;
  restingHr?: number | null;
  workouts?: HealthWorkout[];
}

/** A day received from HealthKit or a Shortcut; absent fields are unknown. */
export type HealthDay = HealthValues & { date: ISODate };

export interface HealthRecord extends HealthValues {
  date: ISODate;
  source: HealthRow["source"];
  updatedAt: string;
}

/** Per-day records, keyed by local calendar day. */
export type HealthData = Record<ISODate, HealthRecord>;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(fromISODate(value)) === value;
}

/** Parse a number that may carry thousands separators or a unit suffix.
 *  Invalid, negative or out-of-range values are ignored (return null). */
export function parseHealthNumber(raw: unknown, field: HealthField): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const match = String(raw).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n < 0 || n > HEALTH_LIMITS[field]) return null;
  return field === "steps" ? Math.round(n) : n;
}

function parseWorkouts(raw: unknown): HealthWorkout[] {
  if (!Array.isArray(raw)) return [];
  const out: HealthWorkout[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    if (typeof w.type !== "string" || !w.type) continue;
    const minutes = parseHealthNumber(w.minutes, "exerciseMin");
    if (minutes === null) continue;
    const kcal = w.kcal === null || w.kcal === undefined ? null : parseHealthNumber(w.kcal, "activeKcal");
    out.push({ type: w.type, minutes, kcal });
  }
  return out;
}

const URL_FIELDS: ReadonlyArray<readonly [HealthField, string]> = [
  ["activeKcal", "active"],
  ["steps", "steps"],
  ["exerciseMin", "exercise"],
  ["distanceKm", "distance"],
  ["sleepHours", "sleep"],
  ["restingHr", "hr"],
];

/** Parse `planner://health?...` from an Apple Shortcut. At least one valid
 *  number is required; invalid values are silently ignored. */
export function parseHealthUrl(url: string, today: ISODate, _now?: string): HealthDay | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol.toLowerCase() !== "planner:") return null;
  const target = (parsed.hostname || parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  if (target !== "health") return null;
  const rawDate = parsed.searchParams.get("date");
  // An unusable date is ignored, just like an unusable number.
  const date = rawDate && isISODate(rawDate) ? rawDate : today;
  const day: HealthDay = { date };
  let found = 0;
  for (const [field, param] of URL_FIELDS) {
    const raw = parsed.searchParams.get(param);
    if (raw === null) continue;
    const value = parseHealthNumber(raw, field);
    if (value !== null) {
      day[field] = value;
      found += 1;
    }
  }
  return found > 0 ? day : null;
}

function blankRecord(date: ISODate, source: HealthRecord["source"], updatedAt: string): HealthRecord {
  return {
    date,
    source,
    updatedAt,
    activeKcal: null,
    steps: null,
    exerciseMin: null,
    distanceKm: null,
    sleepHours: null,
    restingHr: null,
    workouts: [],
  };
}

/** Merge a newer reading into a stored day. A missing value never erases a
 *  stored one; only the fields actually supplied are replaced. */
export function mergeHealthDay(
  current: HealthRecord | undefined,
  incoming: HealthDay,
  source: HealthRecord["source"],
  now: string,
): { record: HealthRecord; changed: boolean } {
  const next: HealthRecord = current
    ? { ...current }
    : blankRecord(incoming.date, source, now);
  let changed = !current;
  for (const field of HEALTH_FIELDS) {
    const value = incoming[field];
    if (value === undefined || value === null) continue;
    if (current?.[field] !== value) changed = true;
    next[field] = value;
  }
  if (incoming.workouts && incoming.workouts.length > 0) {
    if (JSON.stringify(current?.workouts ?? []) !== JSON.stringify(incoming.workouts)) changed = true;
    next.workouts = incoming.workouts;
  }
  if (changed) {
    next.updatedAt = now;
    next.source = source;
  }
  return { record: next, changed };
}

/** Validate a native day (numbers may arrive as strings with units). */
export function sanitizeHealthDay(value: unknown): HealthDay | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isISODate(raw.date)) return null;
  const day: HealthDay = { date: raw.date };
  for (const field of HEALTH_FIELDS) {
    const number = parseHealthNumber(raw[field], field);
    if (number !== null) day[field] = number;
  }
  const workouts = parseWorkouts(raw.workouts);
  if (workouts.length) day.workouts = workouts;
  return day;
}

/** Wire row for POST /ops. */
export function toHealthRow(record: HealthRecord): HealthRow {
  return {
    id: `health_${record.date}`,
    date: record.date,
    activeKcal: record.activeKcal ?? null,
    steps: record.steps ?? null,
    exerciseMin: record.exerciseMin ?? null,
    distanceKm: record.distanceKm ?? null,
    sleepHours: record.sleepHours ?? null,
    restingHr: record.restingHr ?? null,
    workouts: record.workouts ?? [],
    source: record.source,
    updatedAt: record.updatedAt,
    deletedAt: null,
  };
}

/** Wire patch for POST /ops. A local `null` means "unknown", not "clear", so
 *  those fields are omitted: the hub keeps whatever it already stored for the
 *  day. Zero is still sent, because it is a real reading. */
export type HealthRowPatch = Pick<HealthRow, "id" | "date" | "updatedAt" | "source" | "deletedAt"> &
  Partial<Pick<HealthRow, (typeof HEALTH_FIELDS)[number] | "workouts">>;

export function toHealthPatch(record: HealthRecord): HealthRowPatch {
  const patch: HealthRowPatch = {
    id: `health_${record.date}`,
    date: record.date,
    updatedAt: record.updatedAt,
    source: record.source,
    deletedAt: null,
  };
  for (const field of HEALTH_FIELDS) {
    const value = record[field];
    if (value !== null && value !== undefined) patch[field] = value;
  }
  // An empty local list means "nothing known about workouts"; omitting it stops
  // a partial metric push from wiping workouts written by another device.
  if (record.workouts?.length) patch.workouts = record.workouts;
  return patch;
}

/** Accept either `{ <date>: record }` or `{ days: { <date>: record } }`. */
export function sanitizeHealthData(value: unknown): HealthData {
  const source =
    value && typeof value === "object" && "days" in (value as object)
      ? (value as { days: unknown }).days
      : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out: HealthData = {};
  for (const [date, raw] of Object.entries(source as Record<string, unknown>)) {
    if (!isISODate(date) || !raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const record = blankRecord(
      date,
      v.source === "healthkit" ? "healthkit" : "shortcut",
      typeof v.updatedAt === "string" ? v.updatedAt : new Date(0).toISOString(),
    );
    for (const field of HEALTH_FIELDS) {
      const rawValue = v[field];
      if (typeof rawValue === "number" && parseHealthNumber(rawValue, field) !== null) {
        record[field] = rawValue;
      }
    }
    record.workouts = parseWorkouts(v.workouts);
    out[date] = record;
  }
  return out;
}

/** Read the persisted map; corrupt or partial records are skipped. */
export function parseHealthData(raw: string | null | undefined): HealthData {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  return sanitizeHealthData(parsed);
}

export function serializeHealthData(data: HealthData): string {
  return JSON.stringify(data);
}

/** Alias used by the state provider. */
export const healthToRow = toHealthRow;

/** Alias used by the state provider for partial hub pushes. */
export const healthToPatch = toHealthPatch;

const nf = (n: number) => n.toLocaleString("en-US");

/** Quiet line under the calorie bar, e.g. "Burned 410 kcal · 8,000 steps". */
export function healthLine(day: HealthDay | null | undefined): string {
  if (!day) return "";
  const parts: string[] = [];
  if (day.activeKcal !== null && day.activeKcal !== undefined) {
    parts.push(`Burned ${nf(day.activeKcal)} kcal`);
  }
  if (day.steps !== null && day.steps !== undefined) parts.push(`${nf(day.steps)} steps`);
  return parts.join(" · ");
}

/** Human-readable summary used in the deep-link toast. */
export function describeSavedHealth(day: HealthDay): string {
  const parts: string[] = [];
  if (day.activeKcal != null) parts.push(`${nf(day.activeKcal)} kcal`);
  if (day.steps != null) parts.push(`${nf(day.steps)} steps`);
  if (day.exerciseMin != null) parts.push(`${nf(day.exerciseMin)} min exercise`);
  if (day.distanceKm != null) parts.push(`${day.distanceKm} km`);
  if (day.sleepHours != null) parts.push(`${day.sleepHours} h sleep`);
  if (day.restingHr != null) parts.push(`${nf(day.restingHr)} bpm resting HR`);
  const when = isISODate(day.date) ? formatDay(day.date) : day.date;
  return `Saved ${parts.join(", ")} for ${when}`;
}
