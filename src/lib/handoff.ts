import { useCallback, useEffect, useRef } from "react";
import { toISODate } from "../domain/dates";
import type { Category, Note, Settings, Task } from "../domain/model";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { itemsFromDeadlines, taskCountMessage } from "./absorb";
import { useSync } from "../state/sync";
import type { HarnessNote } from "./harness-types";

export interface HandoffPayload {
  fileName: string;
  markdown: string;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

function yaml(value: string): string {
  return JSON.stringify(value ?? "");
}

/** Legacy file-based export, kept for the manual "Send" action. */
export function buildHandoffMarkdown(
  task: Task,
  note: Note,
  settings: Settings,
  /** LearnHarness subject linked through the task's category. */
  subject: string | null,
  now: Date = new Date(),
): HandoffPayload {
  const imageBlock = note.images.length
    ? note.images
        .map((image) => `![${image.name}](${image.dataUrl})`)
        .join("\n\n")
    : "";
  const body = [note.content.trim(), imageBlock].filter(Boolean).join("\n\n");

  const frontmatter = [
    "---",
    `title: ${yaml(task.title)}`,
    `subject: ${yaml(subject ?? "unfiled")}`,
    `date: ${task.date}`,
    `kind: ${task.kind}`,
    "source: planner",
    `task_id: ${task.id}`,
    `handed_off_at: ${now.toISOString()}`,
    `daily_calorie_goal: ${settings.dailyCalorieGoal}`,
    "---",
  ].join("\n");

  const markdown = [
    frontmatter,
    "",
    `# ${task.title}`,
    "",
    body || "(no note content)",
    "",
  ].join("\n");

  return {
    fileName: `${toISODate(now)}-${slugify(task.title)}.md`,
    markdown,
  };
}

// ── Harness hand-off engine ────────────────────────────────────────────────

/** One note to send as a `harness.note` hub command. */
export interface DueHandoff extends HarnessNote {
  /** Content hash recorded once the note is handed off (not sent to the Harness). */
  hash: string;
}

const UNFINISHED_PREFIX = "> Unfinished notes (task not completed)";

/** Markdown stored by LearnHarness. Unfinished notes are prefixed per the API contract. */
export function buildApiMarkdown(_task: Task, note: Note, finished: boolean): string {
  const parts = [note.content.trim(), ...note.images.map((image) => `![${image.name}](${image.dataUrl})`)];
  const body = parts.filter(Boolean).join("\n\n");
  return finished ? body : `${UNFINISHED_PREFIX}\n\n${body}`;
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Edits are sent this long after the last keystroke-level change. */
export const HANDOFF_DEBOUNCE_MS = 60_000;

/** Small stable string hash (FNV-1a) of what a hand-off carries; equal hash = nothing new to send. */
export function noteHash(title: string, date: string, body: string): string {
  let h = 0x811c9dc5;
  const text = `${title}|${date}|${body}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${text.length}`;
}

function noteBody(note: Note): string {
  const parts = [note.content.trim(), ...note.images.map((image) => `![${image.name}](${image.dataUrl})`)];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Pure scheduler: which linked notes need sending right now?
 *
 * A note is only ever sent when it differs from what was last sent (title, date and body hash; legacy
 * notes without a hash fall back to "edited after the last send"). Then it is due
 *  - on completion (or when it was last sent as unfinished), immediately;
 *  - at day end: an unfinished task of a previous day, immediately;
 *  - after an edit, once the note has been quiet for `debounceMs` (sent with finished = task.done).
 * Each task yields at most one note. `_lastRun` is kept for call compatibility.
 */
export function dueHandoffs(
  tasks: readonly Task[],
  categories: readonly Category[],
  now: Date | string = new Date(),
  _lastRun: Date | string | null = null,
  debounceMs: number = HANDOFF_DEBOUNCE_MS,
): DueHandoff[] {
  const nowMs = toMs(now) ?? Date.now();
  const today = toISODate(new Date(nowMs));
  const byCategory = new Map(categories.map((category) => [category.id, category]));
  const due: DueHandoff[] = [];

  for (const task of tasks) {
    const note = task.note;
    if (!note || task.deletedAt) continue;
    const category = byCategory.get(task.categoryId ?? "");
    if (!category?.linkedSubjectId) continue;
    const body = noteBody(note);
    if (!body) continue;

    const hash = noteHash(task.title, task.date, body);
    const sentAt = toMs(note.handoff.sentAt);
    const updatedAt = toMs(note.updatedAt);
    const neverSent = sentAt === null;
    const changed = neverSent
      ? true
      : note.handoff.hash !== undefined
        ? note.handoff.hash !== hash
        : updatedAt !== null && sentAt !== null && updatedAt > sentAt;
    const lastFinished = note.handoff.finished;

    const completionDue = task.done && (changed || lastFinished === false);
    const unfinishedDue = !task.done && task.date < today && (changed || lastFinished === true);
    const editDue = changed && updatedAt !== null && nowMs - updatedAt >= debounceMs;
    if (!completionDue && !unfinishedDue && !editDue) continue;

    const finished = task.done;
    const payload: DueHandoff = {
      externalId: task.id,
      subjectId: category.linkedSubjectId,
      title: task.title,
      date: task.date,
      markdown: buildApiMarkdown(task, note, finished),
      finished,
      hash,
    };
    if (category.linkedTopicId) payload.topicId = category.linkedTopicId;
    due.push(payload);
  }

  return due;
}

export const NOTE_TASKS_EVENT = "planner:tasks-from-note";
const RETRY_AFTER_MS = 60_000;
const TICK_MS = 15_000;
/** A hub deadline only becomes a task while a note of that subject was handed off this recently. */
const MIRROR_WINDOW_MS = 10 * 60_000;

/** Runs the engine on task toggles, every few seconds (the edit debounce) and when the app becomes visible. */
export function useHandoff(): void {
  const { data, ready, actions } = useStore();
  const { tasks, categories } = data;
  const hub = useSync();
  const notify = useToast();
  const hubMode = hub.configured;
  const busyRef = useRef(false);
  const pendingRef = useRef(false);
  const sendingRef = useRef(new Set<string>());
  const attemptRef = useRef(new Map<string, number>());

  const run = useCallback(async () => {
    if (!ready || !hubMode || busyRef.current) {
      if (busyRef.current) pendingRef.current = true;
      return;
    }
    const now = new Date();
    const due = dueHandoffs(tasks, categories, now);
    const next = due.filter((note) => {
      if (sendingRef.current.has(note.externalId)) return false;
      const last = attemptRef.current.get(note.externalId);
      return last === undefined || now.getTime() - last >= RETRY_AFTER_MS;
    });
    if (next.length === 0) return;

    busyRef.current = true;
    try {
      for (const { hash, ...note } of next) {
        sendingRef.current.add(note.externalId);
        attemptRef.current.set(note.externalId, Date.now());
        try {
          // Queue a harness.note command; the laptop agent runs it and
          // trackCommands delivers the result (including any parsed note items).
          const commandId = await hub.sendNote(note);
          actions.recordHandoff(note.externalId, {
            status: "ready",
            sentAt: new Date().toISOString(),
            error: undefined,
            finished: note.finished,
            hash,
            commandId,
            commandStatus: "queued",
          });
        } catch {
          // A command that could not be queued stays unsent and is retried on a later tick.
        } finally {
          sendingRef.current.delete(note.externalId);
        }
      }
    } finally {
      busyRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        queueMicrotask(() => void runRef.current());
      }
    }
  }, [tasks, categories, ready, actions, hubMode, hub.sendNote]);

  const runRef = useRef(run);
  runRef.current = run;

  // Any task/note change (including a completion toggle) is a chance to send.
  useEffect(() => {
    void run();
  }, [run]);

  // The edit debounce is time, not a data change: look again every few seconds.
  useEffect(() => {
    const timer = setInterval(() => void runRef.current(), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void runRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Hub mode: deadlines the Harness added from a note just handed off also become tasks.
  const deadlines = hub.mirror.deadlines;
  useEffect(() => {
    if (!hubMode || deadlines.length === 0) return;
    const cutoff = Date.now() - MIRROR_WINDOW_MS;
    const recent = new Set<string>();
    for (const task of tasks) {
      const sentAt = task.note?.handoff.sentAt ? Date.parse(task.note.handoff.sentAt) : NaN;
      if (task.categoryId && sentAt >= cutoff) recent.add(task.categoryId);
    }
    for (const category of categories) {
      if (!category.linkedSubjectId || !recent.has(category.id)) continue;
      const rows = deadlines.filter(
        (d) =>
          d.subjectId === category.linkedSubjectId &&
          !d.deletedAt &&
          (!category.linkedTopicId || !d.topicId || d.topicId === category.linkedTopicId),
      );
      if (rows.length) actions.addNoteItems(category.id, itemsFromDeadlines(rows));
    }
  }, [hubMode, deadlines, tasks, categories, actions]);

  // Every path that adds tasks from a note announces it here.
  useEffect(() => {
    const onAdded = (event: Event) => {
      const count = (event as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (count > 0) notify(taskCountMessage(count));
    };
    window.addEventListener(NOTE_TASKS_EVENT, onAdded);
    return () => window.removeEventListener(NOTE_TASKS_EVENT, onAdded);
  }, [notify]);
}
