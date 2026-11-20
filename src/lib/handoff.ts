import { useCallback, useEffect, useRef } from "react";
import { toISODate } from "../domain/dates";
import {
  DEFAULT_HARNESS_URL,
  type Category,
  type Note,
  type Settings,
  type Task,
} from "../domain/model";
import { useStore } from "../state/store";
import { useSync } from "../state/sync";
import { HarnessClient, type HarnessNote } from "./harness";

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

/** One API note to send; exactly the shape accepted by `HarnessClient.sendNote`. */
export interface DueHandoff extends HarnessNote {}

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

/**
 * Pure scheduler: which linked notes need sending right now?
 *
 * A note is due when the task was completed since `lastRun`, when it belongs to
 * a previous day and is still unfinished, when its note was edited after the
 * last successful send, or when a completion/unfinished state flip still needs
 * to be reflected at the Harness. Each task yields at most one note.
 */
export function dueHandoffs(
  tasks: readonly Task[],
  categories: readonly Category[],
  now: Date | string = new Date(),
  lastRun: Date | string | null = null,
): DueHandoff[] {
  const nowMs = toMs(now) ?? Date.now();
  const today = toISODate(new Date(nowMs));
  const since = toMs(lastRun);
  const byCategory = new Map(categories.map((category) => [category.id, category]));
  const due: DueHandoff[] = [];

  for (const task of tasks) {
    const note = task.note;
    if (!note || task.deletedAt) continue;
    const category = byCategory.get(task.categoryId ?? "");
    if (!category?.linkedSubjectId) continue;

    const sentAt = toMs(note.handoff.sentAt);
    const updatedAt = toMs(note.updatedAt);
    const completedAt = task.done ? toMs(task.completedAt ?? task.updatedAt) : null;
    const completedSinceLastRun =
      completedAt !== null && completedAt <= nowMs && (since === null || completedAt > since);
    const editedSinceSend = sentAt !== null && updatedAt !== null && updatedAt > sentAt;
    const neverSent = sentAt === null;
    const lastFinished = note.handoff.finished;

    const completionDue =
      task.done &&
      ((completedSinceLastRun && (neverSent || editedSinceSend)) || lastFinished === false);
    const unfinishedDue =
      !task.done &&
      task.date < today &&
      (neverSent || editedSinceSend || lastFinished === true);

    if (!completionDue && !unfinishedDue && !editedSinceSend) continue;

    const finished = task.done;
    const payload: DueHandoff = {
      externalId: task.id,
      subjectId: category.linkedSubjectId,
      title: task.title,
      date: task.date,
      markdown: buildApiMarkdown(task, note, finished),
      finished,
    };
    if (category.linkedTopicId) payload.topicId = category.linkedTopicId;
    due.push(payload);
  }

  return due;
}

/** Runs the engine on task toggles and whenever the app opens or becomes visible. */
export function useHandoff(): void {
  const { data, ready, actions } = useStore();
  const { tasks, categories } = data;
  const hub = useSync();
  const hubMode = hub.configured;
  const url = data.settings.harnessUrl || DEFAULT_HARNESS_URL;
  const lastRunRef = useRef<Date | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef(false);
  const sendingRef = useRef(new Set<string>());

  const run = useCallback(async () => {
    if (!ready || (!url && !hubMode) || busyRef.current) {
      if (busyRef.current) pendingRef.current = true;
      return;
    }
    const now = new Date();
    const due = dueHandoffs(tasks, categories, now, lastRunRef.current);
    lastRunRef.current = now;
    const next = due.filter((note) => !sendingRef.current.has(note.externalId));
    if (next.length === 0) return;

    busyRef.current = true;
    const client = new HarnessClient(url);
    try {
      for (const note of next) {
        sendingRef.current.add(note.externalId);
        try {
          if (hubMode) {
            // Hub mode: queue a harness.note command; the laptop agent runs it.
            const commandId = await hub.sendNote(note);
            actions.recordHandoff(note.externalId, {
              status: "ready",
              sentAt: new Date().toISOString(),
              error: undefined,
              finished: note.finished,
              commandId,
              commandStatus: "queued",
            });
            continue;
          }
          const result = await client.sendNote(note);
          if (result.ok) {
            actions.recordHandoff(note.externalId, {
              status: "sent",
              sentAt: new Date().toISOString(),
              error: undefined,
              finished: note.finished,
            });
          } else {
            actions.recordHandoff(note.externalId, {
              status: "failed",
              error: result.error,
              finished: note.finished,
            });
          }
        } catch (error) {
          actions.recordHandoff(note.externalId, {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            finished: note.finished,
          });
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
  }, [tasks, categories, url, ready, actions, hubMode, hub.sendNote]);

  const runRef = useRef(run);
  runRef.current = run;

  // Any task/note change (including a completion toggle) is a chance to send.
  useEffect(() => {
    void run();
  }, [run]);

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
}
