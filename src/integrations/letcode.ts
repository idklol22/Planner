/** Planner side of the LetCode link.
 *
 * Everything here is free of UI and store side effects: `applySolved` decides
 * which store operations a `practice.solved` event implies, and
 * `practiceStats` turns a stream of those events into summary numbers. The
 * caller owns when to run the returned operations.
 */

import { addDays, toISODate, todayISO, type ISODate } from "../domain/dates";
import type { AppData, Category } from "../domain/model";
import type { Settings } from "../domain/model";
import type { EventRecord } from "../storage/hub";

export interface PracticeSolvedInput {
  id?: string;
  type?: string;
  source?: string | null;
  origin?: string | null;
  payload?: unknown;
  ts?: string;
  idempotencyKey?: string;
  /** Payload fields are accepted at the top level too, for convenience. */
  problemId?: string | number;
  title?: string;
  difficulty?: string;
  language?: string;
  timeMs?: number;
  attempts?: number;
  solvedAt?: string;
}

export type ToggleOp = { kind: "toggle"; taskId: string };

export interface AddTaskOp {
  kind: "add";
  categoryId: string;
  title: string;
  date: ISODate;
  done: true;
  /** The `kind` of the task the store should create. (The op's own `kind` is "add".) */
  taskKind: "practice";
  /** Same values as a ready-to-insert task, for stores that take a single object. */
  readonly task: {
    categoryId: string;
    title: string;
    date: ISODate;
    done: true;
    kind: "practice";
  };
}

export type StoreOp = ToggleOp | AddTaskOp;

/** An array of operations, with two non-enumerable conveniences for callers:
 *  `.ops` (the same array) and `.processed` (the updated idempotency set). */
export type ApplySolvedResult = StoreOp[] & {
  readonly ops: StoreOp[];
  readonly processed: Set<string>;
};

export interface PracticeRangeObject {
  from?: ISODate;
  to?: ISODate;
  /** Aliases used by the summaries UI. */
  start?: ISODate;
  end?: ISODate;
  /** Number of days, ending at `to` (or at the most recent event). */
  days?: number;
}

/** Inclusive date range. `number` means "the last N days". */
export type PracticeRange = PracticeRangeObject | ISODate | readonly [ISODate, ISODate] | number;

export interface PracticeStats {
  solved: number;
  byDifficulty: Record<string, number>;
  /** Longest run of consecutive days with at least one solve. */
  streakDays: number;
}

interface SolvedFields {
  problemId: number;
  title: string;
  difficulty: string;
  solvedAt: string;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asProblemId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const numeric = Number(value.trim().replace(/^lc\s*#?/i, ""));
  if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
  return parseProblemRef(value);
}

/** Pull a number out of a task title: lc125, LC 125, LeetCode #125, #125,
 *  125., "Problem 125", ... Unmarked prose (and dates) has no problem ref. */
export function parseProblemRef(title: string): number | null {
  if (typeof title !== "string") return null;
  const value = title.trim();
  if (!value) return null;

  const marked = [
    /\b(?:leetcode|lc)\s*[#:_.\-]?\s*(\d+)\b/i,
    /#\s*(\d+)\b/,
    /\b(?:problem|prob)\s*[#:]?\s*(\d+)\b/i,
  ];
  for (const pattern of marked) {
    const match = pattern.exec(value);
    if (match) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id) && id > 0) return id;
    }
  }

  // A bare number counts only when it leads the title and is not part of a date.
  const leading = /^#?\s*(\d+)(?=[\s.):_\-/]|$)/.exec(value);
  if (leading) {
    const rest = value.slice(leading[0].length);
    if (!/^[-/]\d/.test(rest.trimStart())) {
      const id = Number(leading[1]);
      if (Number.isSafeInteger(id) && id > 0) return id;
    }
  }
  return null;
}

function normalizeSolved(input: PracticeSolvedInput): SolvedFields | null {
  const top: Record<string, unknown> = isRecord(input) ? input : {};
  const payload = payloadRecord(top.payload);

  const type = asText(top.type);
  if (type && type !== "practice.solved") return null;
  const source = asText(top.source) ?? (payload ? asText(payload.source) : undefined);
  if (source && source.toLowerCase() !== "letcode") return null;

  const problemId = asProblemId(top.problemId ?? payload?.problemId);
  if (problemId === null) return null;

  const title = asText(top.title) ?? (payload ? asText(payload.title) : undefined) ?? "";
  const difficulty = asText(top.difficulty) ?? (payload ? asText(payload.difficulty) : undefined) ?? "";
  const solvedAt =
    asText(top.solvedAt) ??
    (payload ? asText(payload.solvedAt) : undefined) ??
    asText(top.ts) ??
    todayISO();
  const idempotencyKey =
    asText(top.idempotencyKey) ??
    (payload ? asText(payload.idempotencyKey) : undefined) ??
    `letcode:${problemId}:${solvedAt}`;

  return { problemId, title, difficulty, solvedAt, idempotencyKey };
}

/** ISO timestamps use their written calendar day, matching the planner's
 *  local `YYYY-MM-DD` dates. `today` is the fallback for malformed stamps. */
function solveDate(solvedAt: string, today: ISODate): ISODate {
  if (/^\d{4}-\d{2}-\d{2}/.test(solvedAt)) return solvedAt.slice(0, 10);
  const parsed = new Date(solvedAt);
  return Number.isNaN(parsed.getTime()) ? today : toISODate(parsed);
}

function sameProblem(title: string, solved: SolvedFields): boolean {
  if (parseProblemRef(title) === solved.problemId) return true;
  // Also accept the bare id anywhere in the title ("Practice 125 again").
  const escaped = String(solved.problemId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^0-9])${escaped}(?![0-9])`).test(title)) return true;
  const problemTitle = solved.title.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    Boolean(problemTitle) &&
    title.trim().toLowerCase().replace(/\s+/g, " ") === problemTitle
  );
}

function addOp(categoryId: string, title: string, date: ISODate): AddTaskOp {
  const op = {
    kind: "add" as const,
    categoryId,
    title,
    date,
    done: true as const,
    taskKind: "practice" as const,
  };
  const task = { categoryId, title, date, done: true as const, kind: "practice" as const };
  Object.defineProperty(op, "task", { value: task, enumerable: false, configurable: true });
  return op as AddTaskOp;
}

function withMeta(ops: StoreOp[], processed: Set<string>): ApplySolvedResult {
  const result = ops as ApplySolvedResult;
  Object.defineProperties(result, {
    ops: { value: result, enumerable: false, configurable: true },
    processed: { value: processed, enumerable: false, configurable: true },
  });
  return result;
}

function letcodeCategory(data: AppData): Category | undefined {
  const live = data.categories.filter((category) => !category.deletedAt);
  const configured = (data.settings as Settings & { letcodeCategoryId?: unknown })
    .letcodeCategoryId;
  if (typeof configured === "string" && configured.trim()) {
    const found = live.find((category) => category.id === configured);
    if (found) return found;
  }
  return (
    live.find((category) => category.name.trim().toLowerCase() === "daily") ?? live[0]
  );
}

/** Decide how a `practice.solved` event changes the task store.
 *
 *  `processed` is the idempotency cursor: the event's key is added to it (and
 *  returned on `.processed`) so repeated polls cannot tick/add twice. */
export function applySolved(
  data: AppData,
  event: PracticeSolvedInput,
  today: ISODate,
  processed: Set<string> = new Set<string>(),
): ApplySolvedResult {
  const solved = normalizeSolved(event);
  if (!solved) return withMeta([], processed);
  if (processed.has(solved.idempotencyKey)) return withMeta([], processed);

  const date = solveDate(solved.solvedAt, today);
  const match = data.tasks
    .filter(
      (task) =>
        !task.done &&
        !task.deletedAt &&
        task.date === date &&
        sameProblem(task.title, solved),
    )
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];

  const ops: StoreOp[] = match
    ? [{ kind: "toggle", taskId: match.id }]
    : (() => {
        const category = letcodeCategory(data);
        return category
          ? [addOp(category.id, `LC ${solved.problemId} · ${solved.title}`, date)]
          : [];
      })();

  processed.add(solved.idempotencyKey);
  return withMeta(ops, processed);
}

function eventDate(input: PracticeSolvedInput, fallback: ISODate): ISODate {
  const solved = normalizeSolved(input);
  return solveDate(solved?.solvedAt ?? fallback, fallback);
}

function resolveRange(range: PracticeRange, latest: ISODate): { from: ISODate; to: ISODate } {
  if (typeof range === "number") {
    const days = Math.max(1, Math.floor(range));
    return { from: addDays(latest, 1 - days), to: latest };
  }
  if (typeof range === "string") return { from: range, to: range };
  if (Array.isArray(range)) {
    const [start, end] = range as readonly [ISODate, ISODate];
    return { from: start ?? "", to: end ?? latest };
  }

  const options = range as PracticeRangeObject;
  const start = options.from ?? options.start;
  const end = options.to ?? options.end;
  const days =
    typeof options.days === "number" ? Math.max(1, Math.floor(options.days)) : undefined;
  const to = end ?? (start && days ? addDays(start, days - 1) : latest);
  const from = start ?? (days ? addDays(to, 1 - days) : "");
  return { from, to };
}

/** Count solves, difficulties and the longest streak inside an inclusive range.
 *  Duplicate deliveries of the same idempotency key count once. */
export function practiceStats(
  events: readonly PracticeSolvedInput[],
  range: PracticeRange,
): PracticeStats {
  const normalized = events.flatMap((event) => {
    const solved = normalizeSolved(event);
    return solved ? [{ solved, date: eventDate(event, solveDate(solved.solvedAt, todayISO())) }] : [];
  });
  const latest = normalized.reduce<ISODate>(
    (max, entry) => (entry.date > max ? entry.date : max),
    todayISO(),
  );
  const { from, to } = resolveRange(range, latest);

  const seen = new Set<string>();
  const days = new Set<ISODate>();
  const byDifficulty: Record<string, number> = {};
  let solved = 0;

  for (const entry of normalized) {
    if (entry.date < from || entry.date > to) continue;
    const key = entry.solved.idempotencyKey;
    if (seen.has(key)) continue;
    seen.add(key);
    solved += 1;
    days.add(entry.date);
    const difficulty = entry.solved.difficulty.trim();
    if (difficulty) byDifficulty[difficulty] = (byDifficulty[difficulty] ?? 0) + 1;
  }

  let streakDays = 0;
  let current = 0;
  let previous: ISODate | null = null;
  for (const day of [...days].sort()) {
    current = previous !== null && addDays(previous, 1) === day ? current + 1 : 1;
    streakDays = Math.max(streakDays, current);
    previous = day;
  }

  return { solved, byDifficulty, streakDays };
}

export type { EventRecord };
