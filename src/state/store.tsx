import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle } from "lucide-react";
import { uid } from "../domain/ids";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { deleteCategory as deleteCategoryData, undoCategoryDelete } from "../domain/categories";
import {
  defaultData,
  makeCalorieEntry,
  makeCategory,
  makeGoal,
  makeHabit,
  makeNote,
  makeTask,
  type AppData,
  type Category,
  type CategoryGoal,
  type HandoffState,
  type Note,
  type Settings,
  type Task,
} from "../domain/model";
import { materializeOccurrences } from "../domain/recurrence";
import { newerStamp } from "../domain/stamp";
import {
  moveTasksToDay,
  moveUnfinishedToToday as moveUnfinishedToTodayDomain,
  restoreTasks,
  subtasksOf,
  unfinishedTopLevelOn,
} from "../domain/tasks";
import { tasksForItems, type NoteItem } from "../lib/absorb";
import { buildHandoffMarkdown, NOTE_TASKS_EVENT } from "../lib/handoff";
import { isTauri, storage } from "../storage";
import { isSafetyCopyError, type LoadIssue, type LoadResult, type SaveBlockReason } from "../storage/port";

export type { SaveBlockReason } from "../storage/port";

type Mutator = (data: AppData) => AppData;

/** Kept as a pure function so the wording can be checked without a DOM. */
export function saveBlockedMessage(reason: SaveBlockReason): string {
  return reason === "backup"
    ? "Changes are not being saved because the original data could not be backed up (storage may be full)."
    : "Saved data could not be read, so changes are not being saved. The original is left untouched while the app retries.";
}

/** The toast lives in the store so it can report a failed load on the very
 *  first render, before the app's toast provider (a child) is mounted. */
function RecoveryNotice({ issue }: { issue: LoadIssue }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), 8_000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!open) return null;
  const message =
    issue.reason === "unreadable"
      ? "Saved data could not be read. The original was kept as a backup."
      : `Some saved items could not be read (${issue.dropped} skipped). The original was kept as a backup.`;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[calc(12px+var(--safe-top))] z-[110] w-max max-w-[calc(100vw-32px)] -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line-2 bg-surface-2/95 px-4 py-2.5 text-sm text-ink shadow-2xl shadow-black/50 backdrop-blur-xl">
        <AlertCircle size={16} className="shrink-0 text-rose" />
        <span>{message}</span>
        <button onClick={() => setOpen(false)} className="ui-press ml-2 text-faint hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Unlike a one-off load report, this stays up until saving has resumed. It
 *  has no dismiss button: the user must be able to see that edits are held. */
function SaveBlockedNotice({ reason }: { reason: SaveBlockReason }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="pointer-events-none fixed left-1/2 top-[calc(12px+var(--safe-top))] z-[110] w-max max-w-[calc(100vw-32px)] -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-rose/40 bg-surface-2/95 px-4 py-2.5 text-sm text-ink shadow-2xl shadow-black/50 backdrop-blur-xl">
        <AlertCircle size={16} className="shrink-0 text-rose" />
        <span>{saveBlockedMessage(reason)}</span>
      </div>
    </div>
  );
}

/** Snapshot behind a single category-delete Undo toast. */
export interface CategoryDeleteSnapshot {
  before: AppData;
  after: AppData;
}

// Millisecond timestamps collide on fast successive edits, and the outbox
// drops equal-stamped writes. Keep local stamps strictly increasing.
let lastStamp = "";
const nowISO = () => {
  lastStamp = newerStamp(new Date().toISOString(), lastStamp);
  return lastStamp;
};

/** Patch one task and stamp updatedAt (needed for sync). */
function mapTask(data: AppData, id: string, fn: (task: Task) => Task): AppData {
  return {
    ...data,
    tasks: data.tasks.map((task) => (task.id === id ? { ...fn(task), updatedAt: nowISO() } : task)),
  };
}

function patchNote(data: AppData, taskId: string, fn: (note: Note) => Note): AppData {
  return mapTask(data, taskId, (task) =>
    task.note ? { ...task, note: { ...fn(task.note), updatedAt: nowISO() } } : task,
  );
}

function mapCategory(data: AppData, id: string, fn: (c: Category) => Category): AppData {
  return {
    ...data,
    categories: data.categories.map((c) => (c.id === id ? { ...fn(c), updatedAt: nowISO() } : c)),
  };
}

function mapGoal(data: AppData, id: string, fn: (g: CategoryGoal) => CategoryGoal): AppData {
  return {
    ...data,
    goals: data.goals.map((g) => (g.id === id ? { ...fn(g), updatedAt: nowISO() } : g)),
  };
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "date"
    | "categoryId"
    | "time"
    | "durationMin"
    | "rrule"
    | "deadline"
    | "kind"
    | "order"
  >
>;

export interface HabitInput {
  title: string;
  categoryId: string | null;
  startDate: ISODate;
  endDate: ISODate | null;
  weekdays?: number[];
}

export interface Actions {
  addCategory(name: string, color?: string, icon?: string): string;
  updateCategory(
    id: string,
    patch: Partial<Pick<Category, "name" | "color" | "icon" | "linkedSubjectId" | "linkedTopicId">>,
  ): void;
  /** Persist a new order from a list of category ids. */
  reorderCategories(ids: string[]): void;
  archiveCategory(id: string, archived?: boolean): void;
  /** Soft-delete a category with its tasks/goals/habits references cleaned up. */
  /** Cascade the deletion to all the category's tasks. */
  deleteCategory(id: string): void;
  /** Restore a category deletion. The toast's own snapshot wins over a newer action's. */
  undoDeleteCategory(snapshot?: CategoryDeleteSnapshot): void;
  /** Snapshot for this toast, captured right after the action that created it. */
  snapshotCategoryDelete(): CategoryDeleteSnapshot | null;

  addTask(date: ISODate, title: string, categoryId?: string | null, habitId?: string | null): string;
  updateTask(id: string, patch: TaskPatch): void;
  toggleTask(id: string): void;
  moveTaskToDay(id: string, date: ISODate): void;
  /** Move every unfinished top-level task on `date` one day forward; returns how many moved. */
  moveUnfinishedToTomorrow(date: ISODate): number;
  /** Move every unfinished top-level task on `date` to today; returns the count and an undo. */
  moveUnfinishedToToday(date: ISODate): { moved: number; undo: () => void };
  duplicateTask(id: string): string | null;
  /** Soft delete (also deletes subtasks). */
  deleteTask(id: string): void;
  /** Archive (or restore) a task and its live subtasks. */
  archiveTask(id: string, archived?: boolean): void;
  /** Restore an archived task and its subtasks. */
  restoreTask(id: string): void;
  /** Undo a delete/archive/restore by restoring only that action's tasks. */
  undoTaskChange(snapshot?: Task[]): void;
  /** Snapshot for this toast, captured right after the action that created it. */
  snapshotTaskChange(): Task[] | null;
  /** Returns the new subtask id (empty string when nothing was created). */
  addSubtask(parentId: string, title: string): string;
  /** Create missing recurring occurrences for these days (idempotent). */
  materialize(dates: ISODate[]): void;

  ensureNote(taskId: string): void;
  updateNote(taskId: string, content: string): void;
  /** Task page: store BlockNote JSON plus its Markdown export. */
  updateNoteBlocks(taskId: string, blocks: unknown[], content: string): void;
  addImage(taskId: string, image: { name: string; dataUrl: string }): void;
  removeImage(taskId: string, imageId: string): void;
  markNoteDone(taskId: string): void;
  /** Record an API hand-off result without marking the note itself as edited. */
  recordHandoff(taskId: string, handoff: Partial<HandoffState>): void;
  /** Create tasks for dated items found in a note (deduped); returns how many were added. */
  addNoteItems(categoryId: string, items: NoteItem[]): number;
  /** LetCode: add an already-completed practice task. */
  addDoneTask(categoryId: string, title: string, date: ISODate): string;
  sendToLearnHarness(taskId: string): Promise<{ ok: boolean; message: string }>;

  addHabit(input: HabitInput): string;
  updateHabit(id: string, patch: Partial<HabitInput>): void;
  /** Archive (or restore) a habit. `deletedAt` is the archive flag. */
  archiveHabit(id: string, archived?: boolean): void;
  /** Soft delete; existing tasks created from it stay. */
  deleteHabit(id: string): void;
  /** Turn a habit's ghost on `date` into a real task. */
  acceptGhost(habitId: string, date: ISODate): string | null;

  /** Persistent per-category goals (independent of the selected day). Returns the new id ("" when empty). */
  addGoal(categoryId: string, title: string): string;
  editGoal(id: string, title: string): void;
  /** Persist a new order from a list of goal ids (one category). */
  reorderGoals(ids: string[]): void;
  achieveGoal(id: string): void;
  unachieveGoal(id: string): void;
  deleteGoal(id: string): void;

  /** Log calories, protein or both in one entry (existing kcal-only callers stay valid). */
  addCalorie(date: ISODate, kcal: number, protein?: number): void;
  deleteCalorie(id: string): void;

  updateSettings(patch: Partial<Settings>): void;
  addSubject(name: string): void;
  removeSubject(name: string): void;
}

interface StoreValue {
  data: AppData;
  /** Latest data, even between renders (used by the sync controller). */
  getData(): AppData;
  /** Cancel the pending debounced save and persist the latest data now. */
  flush(): Promise<void>;
  /** Apply a pure transform immediately (remote rows from the hub). */
  applyData(fn: (data: AppData) => AppData): void;
  ready: boolean;
  isNative: boolean;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [loadIssue, setLoadIssue] = useState<LoadIssue | null>(null);
  const [blockReason, setBlockReason] = useState<SaveBlockReason | null>(null);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  /** Snapshot captured by the last task archive/delete/restore, consumed by undo. */
  const taskChangeSnapshot = useRef<Task[] | null>(null);
  /** Snapshot captured by the last `deleteCategory`, consumed by undo. */
  const deleteSnapshot = useRef<CategoryDeleteSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const loading: Promise<LoadResult> = storage.loadWithReport
      ? storage.loadWithReport()
      : storage.load().then((data) => ({ data, issue: null }));
    loading
      .then((loaded) => {
        if (!alive) return;
        if (loaded.data) setData(loaded.data);
        if (loaded.issue) setLoadIssue(loaded.issue);
        if (loaded.readFailed) setBlockReason("read");
        else if (loaded.blocked) setBlockReason("backup");
      })
      .catch(() => {
        // Nothing was read and nothing was copied. Do not claim a backup: the
        // only copy of the original may still be the one on disk.
        if (alive) setBlockReason("read");
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // While a safety copy is missing, even a debounced autosave (including a
    // sync-driven apply) must not replace the data key.
    if (!ready || blockReason) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void storage.save(data).catch(() => {
        // Persistence errors are surfaced by the storage adapter in native builds.
      });
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [data, ready, blockReason]);

  // Keep trying until saving can resume: copies may become writable, or a
  // native read that failed at startup may succeed on a later attempt.
  useEffect(() => {
    if (!ready || !blockReason) return;
    let cancelled = false;
    const attempt = async () => {
      if (blockReason === "read") {
        const retry = storage.retryLoad ?? storage.loadWithReport;
        if (!retry) return;
        try {
          const loaded = await retry.call(storage);
          if (cancelled) return;
          if (loaded.readFailed) return;
          if (loaded.data) {
            // The recovered store wins over defaults or edits made meanwhile.
            dataRef.current = loaded.data;
            setData(loaded.data);
          }
          if (loaded.issue) setLoadIssue(loaded.issue);
          setBlockReason(loaded.blocked ? "backup" : null);
        } catch {
          // The read still throws: leave the notice up and try again.
        }
        return;
      }
      try {
        // save() retries the pending copies and refuses to write if they are
        // still missing. That also covers flush on background and reset.
        await storage.save(dataRef.current);
        if (!cancelled) setBlockReason(null);
      } catch (error) {
        if (cancelled) return;
        if (isSafetyCopyError(error)) setBlockReason(error.reason === "read" ? "read" : "backup");
      }
    };
    void attempt();
    const timer = window.setInterval(() => void attempt(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [blockReason, ready]);

  const update = useCallback((mutator: Mutator) => {
    setData((prev) => mutator(prev));
  }, []);

  const archiveHabit = useCallback(
    (id: string, archived = true) => {
      update((d) => {
        const stamp = nowISO();
        return {
          ...d,
          habits: d.habits.map((h) =>
            h.id === id ? { ...h, deletedAt: archived ? stamp : undefined, updatedAt: stamp } : h,
          ),
        };
      });
    },
    [update],
  );

  /** Stamp (or clear) `archivedAt` on a task and its live subtasks, snapshotting
   *  the touched objects so a single Undo can restore just those by id. */
  const archiveTask = useCallback(
    (id: string, archived = true) => {
      const before = dataRef.current;
      // When restoring, leave subtasks the user archived separately alone. Keep them in
      // archive/delete snapshots so Undo still restores their original state.
      const touched = before.tasks.filter(
        (t) =>
          t.id === id ||
          (t.parentId === id && !t.deletedAt && (archived || !t.archivedAt)),
      );
      if (!touched.some((t) => t.id === id)) return;
      const stamp = nowISO();
      const ids = new Set(touched.map((t) => t.id));
      taskChangeSnapshot.current = touched;
      update((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          ids.has(t.id) ? { ...t, archivedAt: archived ? stamp : undefined, updatedAt: stamp } : t,
        ),
      }));
    },
    [update],
  );

  const actions = useMemo<Actions>(
    () => ({
      addCategory(name, color, icon) {
        const id = uid("cat");
        update((d) => {
          const order = d.categories.reduce((m, c) => Math.max(m, c.order + 1), 0);
          const cat = { ...makeCategory(name.trim() || "Untitled", order, color), id, icon };
          return { ...d, categories: [...d.categories, cat] };
        });
        return id;
      },
      updateCategory(id, patch) {
        update((d) => mapCategory(d, id, (c) => ({ ...c, ...patch })));
      },
      reorderCategories(ids) {
        update((d) => {
          const stamp = nowISO();
          return {
            ...d,
            categories: d.categories.map((c) => {
              const idx = ids.indexOf(c.id);
              return idx === -1 || idx === c.order ? c : { ...c, order: idx, updatedAt: stamp };
            }),
          };
        });
      },
      archiveCategory(id, archived = true) {
        update((d) => mapCategory(d, id, (c) => ({ ...c, archived })));
      },
      deleteCategory(id) {
        const before = dataRef.current;
        const next = deleteCategoryData(before, id, nowISO());
        if (next === before) return;
        deleteSnapshot.current = { before, after: next };
        update(() => next);
      },
      snapshotCategoryDelete() {
        return deleteSnapshot.current;
      },
      undoDeleteCategory(snapshot) {
        const use = snapshot ?? deleteSnapshot.current;
        if (!use) return;
        if (!snapshot || deleteSnapshot.current === use) deleteSnapshot.current = null;
        const stamp = nowISO();
        update((d) => undoCategoryDelete(d, use.before, use.after, stamp));
      },

      addTask(date, title, categoryId = null, habitId = null) {
        const id = uid("task");
        update((d) => {
          const order =
            d.tasks
              .filter((t) => t.date === date && !t.parentId && !t.deletedAt)
              .reduce((m, t) => Math.max(m, t.order + 1), 0);
          const task: Task = { ...makeTask(date, title.trim(), order), id, categoryId, habitId };
          return { ...d, tasks: [...d.tasks, task] };
        });
        return id;
      },
      updateTask(id, patch) {
        update((d) => mapTask(d, id, (task) => ({ ...task, ...patch })));
      },
      toggleTask(id) {
        update((d) =>
          mapTask(d, id, (task) => ({
            ...task,
            done: !task.done,
            completedAt: task.done ? undefined : nowISO(),
          })),
        );
      },
      moveTaskToDay(id, date) {
        update((d) => {
          const { tasks } = moveTasksToDay(d.tasks, [id], date, nowISO());
          return { ...d, tasks };
        });
      },
      moveUnfinishedToTomorrow(date) {
        const ids = unfinishedTopLevelOn(dataRef.current.tasks, date).map((t) => t.id);
        const { tasks, moved } = moveTasksToDay(
          dataRef.current.tasks,
          ids,
          addDays(date, 1),
          nowISO(),
        );
        if (moved.length) update((d) => ({ ...d, tasks }));
        return moved.length;
      },
      moveUnfinishedToToday(date) {
        const result = moveUnfinishedToTodayDomain(
          dataRef.current.tasks,
          date,
          todayISO(),
          nowISO(),
        );
        update((d) => ({ ...d, tasks: result.tasks }));
        return {
          moved: result.moved.length,
          undo: () => {
            const stamp = nowISO();
            update((d) => ({ ...d, tasks: restoreTasks(d.tasks, result.previous, stamp) }));
          },
        };
      },
      duplicateTask(id) {
        const source = dataRef.current.tasks.find((t) => t.id === id);
        if (!source) return null;
        const newId = uid("task");
        update((d) => {
          const stamp = nowISO();
          const copy: Task = {
            ...source,
            id: newId,
            order: source.order + 0.5,
            done: false,
            completedAt: undefined,
            seriesId: null,
            note: null,
            createdAt: stamp,
            updatedAt: stamp,
            deletedAt: undefined,
            archivedAt: undefined,
          };
          const subs = subtasksOf(d.tasks, id).map((s) => ({
            ...s,
            id: uid("task"),
            parentId: newId,
            done: false,
            completedAt: undefined,
            note: null,
            createdAt: stamp,
            updatedAt: stamp,
          }));
          return { ...d, tasks: [...d.tasks, copy, ...subs] };
        });
        return newId;
      },
      archiveTask,
      restoreTask(id) {
        archiveTask(id, false);
      },
      snapshotTaskChange() {
        return taskChangeSnapshot.current;
      },
      undoTaskChange(snapshot) {
        const use = snapshot ?? taskChangeSnapshot.current;
        if (!use) return;
        if (!snapshot || taskChangeSnapshot.current === use) taskChangeSnapshot.current = null;
        const stamp = nowISO();
        update((d) => ({ ...d, tasks: restoreTasks(d.tasks, use, stamp) }));
      },
      deleteTask(id) {
        const stamp = nowISO();
        const ids = new Set(
          dataRef.current.tasks
            .filter((t) => t.id === id || t.parentId === id)
            .map((t) => t.id),
        );
        if (!ids.size) return;
        taskChangeSnapshot.current = dataRef.current.tasks.filter((t) => ids.has(t.id));
        update((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            ids.has(t.id) ? { ...t, deletedAt: stamp, updatedAt: stamp } : t,
          ),
        }));
      },
      addSubtask(parentId, title) {
        const clean = title.trim();
        if (!clean) return "";
        const id = uid("task");
        update((d) => {
          const parent = d.tasks.find((t) => t.id === parentId);
          if (!parent) return d;
          const order = d.tasks.filter((t) => t.parentId === parentId).length;
          const sub: Task = {
            ...makeTask(parent.date, clean, order),
            id,
            parentId,
            categoryId: parent.categoryId,
          };
          return { ...d, tasks: [...d.tasks, sub] };
        });
        return id;
      },
      materialize(dates) {
        update((d) => {
          const fresh = materializeOccurrences(d.tasks, dates);
          return fresh.length ? { ...d, tasks: [...d.tasks, ...fresh] } : d;
        });
      },

      ensureNote(taskId) {
        update((d) =>
          mapTask(d, taskId, (task) => (task.note ? task : { ...task, note: makeNote(taskId) })),
        );
      },
      updateNoteBlocks(taskId, blocks, content) {
        update((d) =>
          patchNote(d, taskId, (note) => ({
            ...note,
            blocks,
            content,
            // Keep sentAt/hash so the hand-off engine can tell an edit from an unchanged note.
            handoff: { ...note.handoff, status: "not-done" },
          })),
        );
      },
      updateNote(taskId, content) {
        // Keep sentAt so the hand-off engine can spot edits after a send.
        update((d) =>
          patchNote(d, taskId, (note) => ({
            ...note,
            content,
            handoff: { ...note.handoff, status: "not-done" },
          })),
        );
      },
      addImage(taskId, image) {
        update((d) =>
          patchNote(d, taskId, (note) => ({
            ...note,
            images: [...note.images, { id: uid("img"), name: image.name, dataUrl: image.dataUrl }],
          })),
        );
      },
      removeImage(taskId, imageId) {
        update((d) =>
          patchNote(d, taskId, (note) => ({
            ...note,
            images: note.images.filter((image) => image.id !== imageId),
          })),
        );
      },
      recordHandoff(taskId, handoff) {
        // Stamp the task and note: without a newer updatedAt sync never sends
        // the hand-off result, so another device sends the same note again.
        update((d) =>
          patchNote(d, taskId, (note) => ({
            ...note,
            handoff: { ...note.handoff, ...handoff },
          })),
        );
      },
      markNoteDone(taskId) {
        update((d) => {
          const task = d.tasks.find((t) => t.id === taskId);
          const subject = d.categories.find((c) => c.id === task?.categoryId)?.linkedSubjectId;
          const marked = mapTask(d, taskId, (t) =>
            t.note
              ? { ...t, done: true, completedAt: nowISO() }
              : t,
          );
          return patchNote(marked, taskId, (note) => ({
            ...note,
            handoff: { ...note.handoff, status: subject ? "ready" : "not-done" },
          }));
        });
      },
      addNoteItems(categoryId, items) {
        const count = tasksForItems(dataRef.current.tasks, categoryId, items).length;
        if (count === 0) return 0;
        update((d) => {
          const specs = tasksForItems(d.tasks, categoryId, items);
          const stamp = nowISO();
          const next = [...d.tasks];
          for (const spec of specs) {
            const order = next
              .filter((t) => t.date === spec.date && !t.parentId && !t.deletedAt)
              .reduce((m, t) => Math.max(m, t.order + 1), 0);
            next.push({
              ...makeTask(spec.date, spec.title, order),
              categoryId,
              kind: spec.kind,
              deadline: spec.deadline,
              ...(spec.time ? { time: spec.time } : {}),
              createdAt: stamp,
              updatedAt: stamp,
            });
          }
          return { ...d, tasks: next };
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(NOTE_TASKS_EVENT, { detail: { count } }));
        }
        return count;
      },
      addDoneTask(categoryId, title, date) {
        const id = uid("task");
        update((d) => {
          const stamp = nowISO();
          const order = d.tasks
            .filter((t) => t.date === date && !t.parentId && !t.deletedAt)
            .reduce((m, t) => Math.max(m, t.order + 1), 0);
          const task: Task = {
            ...makeTask(date, title, order),
            id,
            categoryId,
            kind: "practice",
            done: true,
            completedAt: stamp,
          };
          return { ...d, tasks: [...d.tasks, task] };
        });
        return id;
      },
      async sendToLearnHarness(taskId) {
        const current = dataRef.current;
        const task = current.tasks.find((t) => t.id === taskId);
        const subject =
          current.categories.find((c) => c.id === task?.categoryId)?.linkedSubjectId ?? null;
        if (!task?.note || !subject) {
          return { ok: false, message: "Link the category to a LearnHarness subject first" };
        }
        const { fileName, markdown } = buildHandoffMarkdown(
          task,
          task.note,
          current.settings,
          subject,
        );
        try {
          const path = await storage.exportNote(fileName, markdown, current.settings.handoffFolder);
          update((d) =>
            patchNote(d, taskId, (note) => ({
              ...note,
              handoff: { status: "sent", sentAt: nowISO(), fileName: path, error: undefined },
            })),
          );
          return { ok: true, message: path };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          update((d) =>
            patchNote(d, taskId, (note) => ({
              ...note,
              handoff: { ...note.handoff, status: "failed", error: message },
            })),
          );
          return { ok: false, message };
        }
      },

      addHabit(input) {
        const habit = makeHabit(
          input.title.trim() || "Habit",
          input.categoryId,
          input.startDate,
          input.endDate,
          input.weekdays,
        );
        update((d) => ({ ...d, habits: [...d.habits, habit] }));
        return habit.id;
      },
      updateHabit(id, patch) {
        update((d) => ({
          ...d,
          habits: d.habits.map((h) => {
            if (h.id !== id) return h;
            const next = { ...h, ...patch, updatedAt: nowISO() };
            const days = next.weekdays;
            next.weekdays = days && days.length > 0 && days.length < 7 ? days : undefined;
            return next;
          }),
        }));
      },
      archiveHabit,
      deleteHabit(id) {
        archiveHabit(id, true);
      },
      acceptGhost(habitId, date) {
        const habit = dataRef.current.habits.find((h) => h.id === habitId && !h.deletedAt);
        if (!habit) return null;
        const id = uid("task");
        update((d) => {
          if (d.tasks.some((t) => t.date === date && t.habitId === habitId && !t.deletedAt && !t.archivedAt)) return d;
          const order = d.tasks
            .filter((t) => t.date === date && !t.parentId && !t.deletedAt && !t.archivedAt)
            .reduce((m, t) => Math.max(m, t.order + 1), 0);
          const task: Task = {
            ...makeTask(date, habit.title, order),
            id,
            categoryId: habit.categoryId,
            habitId: habit.id,
          };
          return { ...d, tasks: [...d.tasks, task] };
        });
        return id;
      },

      addGoal(categoryId, title) {
        const clean = title.trim();
        if (!clean) return "";
        const id = uid("goal");
        update((d) => {
          const order = d.goals
            .filter((g) => g.categoryId === categoryId && !g.deletedAt)
            .reduce((m, g) => Math.max(m, g.order + 1), 0);
          return { ...d, goals: [...d.goals, { ...makeGoal(categoryId, clean, order), id }] };
        });
        return id;
      },
      editGoal(id, title) {
        const clean = title.trim();
        if (!clean) return;
        update((d) => mapGoal(d, id, (g) => ({ ...g, title: clean })));
      },
      reorderGoals(ids) {
        update((d) => {
          const stamp = nowISO();
          return {
            ...d,
            goals: d.goals.map((g) => {
              const idx = ids.indexOf(g.id);
              return idx === -1 || idx === g.order ? g : { ...g, order: idx, updatedAt: stamp };
            }),
          };
        });
      },
      achieveGoal(id) {
        update((d) => mapGoal(d, id, (g) => ({ ...g, achievedAt: g.achievedAt ?? nowISO() })));
      },
      unachieveGoal(id) {
        update((d) => mapGoal(d, id, (g) => ({ ...g, achievedAt: undefined })));
      },
      deleteGoal(id) {
        update((d) => {
          const stamp = nowISO();
          return mapGoal(d, id, (g) => ({ ...g, deletedAt: stamp, updatedAt: stamp }));
        });
      },

      addCalorie(date, kcal, protein) {
        const hasKcal = Number.isFinite(kcal) && kcal > 0;
        const hasProtein = protein !== undefined && Number.isFinite(protein) && protein > 0;
        if (!hasKcal && !hasProtein) return;
        const entry = makeCalorieEntry(
          date,
          hasKcal ? Math.round(kcal) : 0,
          undefined,
          hasProtein ? protein : undefined,
        );
        update((d) => ({ ...d, calories: [...d.calories, entry] }));
      },
      deleteCalorie(id) {
        update((d) => {
          const stamp = nowISO();
          return {
            ...d,
            calories: d.calories.map((c) => (c.id === id ? { ...c, deletedAt: stamp, updatedAt: stamp } : c)),
          };
        });
      },

      updateSettings(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },
      addSubject(name) {
        const clean = name.trim();
        if (!clean) return;
        update((d) =>
          d.settings.learnharnessSubjects.includes(clean)
            ? d
            : {
                ...d,
                settings: {
                  ...d.settings,
                  learnharnessSubjects: [...d.settings.learnharnessSubjects, clean],
                },
              },
        );
      },
      removeSubject(name) {
        update((d) => ({
          ...d,
          settings: {
            ...d.settings,
            learnharnessSubjects: d.settings.learnharnessSubjects.filter((s) => s !== name),
          },
        }));
      },
    }),
    [update, archiveHabit],
  );

  const getData = useCallback(() => dataRef.current, []);
  const applyData = useCallback((fn: (d: AppData) => AppData) => {
    dataRef.current = fn(dataRef.current);
    setData((prev) => fn(prev));
  }, []);
  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await storage.save(dataRef.current);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ data, getData, flush, applyData, ready, isNative: isTauri, actions }),
    [data, getData, flush, applyData, ready, actions],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      {blockReason ? (
        <SaveBlockedNotice reason={blockReason} />
      ) : (
        loadIssue && <RecoveryNotice issue={loadIssue} />
      )}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
