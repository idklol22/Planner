import type { Task, TaskKind } from "../domain/model";

/** A dated item the Harness found in a note (POST /api/planner/notes result / harness.note command result). */
export interface NoteItem {
  title: string;
  kind: "assignment" | "exam" | "quiz" | "other";
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time?: string;
  syllabus?: string;
}

/** What to create for an item: the fields a new task needs beyond its category. */
export interface NewTaskSpec {
  title: string;
  date: string;
  time?: string;
  kind: TaskKind;
  deadline: boolean;
}

const STOP = new Set(["the", "a", "an", "of", "for", "and", "to", "on", "in", "we", "have", "is"]);

/** Lower-case word tokens, filler removed, a trailing plural "s" dropped. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP.has(token))
    .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token));
}

/** Shared tokens over the smaller token set (0..1). */
export function titleOverlap(a: string, b: string): number {
  const x = new Set(titleTokens(a));
  const y = new Set(titleTokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const token of x) if (y.has(token)) shared += 1;
  return shared / Math.min(x.size, y.size);
}

export const similarTitles = (a: string, b: string, threshold = 0.6): boolean =>
  titleOverlap(a, b) >= threshold;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Keep only well-formed items from an untrusted result. */
export function parseNoteItems(value: unknown): NoteItem[] {
  if (!Array.isArray(value)) return [];
  const items: NoteItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.title !== "string" || !e.title.trim()) continue;
    if (typeof e.date !== "string" || !DATE.test(e.date)) continue;
    const kind = e.kind === "assignment" || e.kind === "exam" || e.kind === "quiz" ? e.kind : "other";
    items.push({
      title: e.title.trim(),
      kind,
      date: e.date,
      ...(typeof e.time === "string" && TIME.test(e.time) ? { time: e.time } : {}),
      ...(typeof e.syllabus === "string" && e.syllabus.trim() ? { syllabus: e.syllabus.trim() } : {}),
    });
  }
  return items;
}

/**
 * The tasks to create for `items` in one category: assignments, exams and quizzes become "study" deadlines
 * (with their time), anything else a "class" task. An item is skipped when the category already has a live
 * task on that date with a similar title, or an earlier item of the same batch already covers it.
 */
export function tasksForItems(
  tasks: readonly Task[],
  categoryId: string,
  items: readonly NoteItem[],
): NewTaskSpec[] {
  const pool = tasks
    .filter((task) => task.categoryId === categoryId && !task.deletedAt)
    .map((task) => ({ date: task.date, title: task.title }));
  const specs: NewTaskSpec[] = [];
  for (const item of items) {
    if (pool.some((t) => t.date === item.date && similarTitles(t.title, item.title))) continue;
    pool.push({ date: item.date, title: item.title });
    const serious = item.kind !== "other";
    specs.push({
      title: item.title,
      date: item.date,
      ...(item.time ? { time: item.time } : {}),
      kind: serious ? "study" : "class",
      deadline: serious,
    });
  }
  return specs;
}

/** Hub mirror deadline rows as note items (due is a date or a local date-time). */
export function itemsFromDeadlines(
  rows: ReadonlyArray<{ title: string; due: string; kind: string; done: boolean }>,
): NoteItem[] {
  return parseNoteItems(
    rows
      .filter((row) => !row.done)
      .map((row) => ({
        title: row.title,
        kind: row.kind,
        date: row.due.slice(0, 10),
        time: row.due.length > 10 ? row.due.slice(11, 16) : undefined,
      })),
  );
}

export const taskCountMessage = (count: number): string =>
  `Added ${count} task${count === 1 ? "" : "s"} from your note`;
