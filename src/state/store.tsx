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
import { uid } from "../domain/ids";
import type { ISODate } from "../domain/dates";
import {
  defaultData,
  makeCategory,
  makeHabit,
  makeNote,
  makeTask,
  type AppData,
  type CalorieEntry,
  type Category,
  type Habit,
  type MealSlot,
  type Note,
  type Settings,
  type Task,
} from "../domain/model";
import { materializeOccurrences } from "../domain/recurrence";
import { subtasksOf } from "../domain/tasks";
import { buildHandoffMarkdown } from "../lib/handoff";
import { isTauri, storage } from "../storage";

type Mutator = (data: AppData) => AppData;

const nowISO = () => new Date().toISOString();

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

export interface Actions {
  addCategory(name: string, color?: string, icon?: string): string;
  updateCategory(
    id: string,
    patch: Partial<Pick<Category, "name" | "color" | "icon" | "linkedSubjectId">>,
  ): void;
  /** Persist a new order from a list of category ids. */
  reorderCategories(ids: string[]): void;
  archiveCategory(id: string, archived?: boolean): void;

  addTask(date: ISODate, title: string, categoryId?: string | null): string;
  updateTask(id: string, patch: TaskPatch): void;
  toggleTask(id: string): void;
  moveTaskToDay(id: string, date: ISODate): void;
  duplicateTask(id: string): string | null;
  /** Soft delete (also deletes subtasks). */
  deleteTask(id: string): void;
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
  sendToLearnHarness(taskId: string): Promise<{ ok: boolean; message: string }>;

  addHabit(title: string, cadence: Habit["cadence"]): void;
  toggleHabitDate(id: string, date: ISODate): void;
  deleteHabit(id: string): void;

  addCalorie(date: ISODate, slot: MealSlot, label: string, kcal: number): void;
  deleteCalorie(id: string): void;

  updateSettings(patch: Partial<Settings>): void;
  addSubject(name: string): void;
  removeSubject(name: string): void;
}

interface StoreValue {
  data: AppData;
  ready: boolean;
  isNative: boolean;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let alive = true;
    storage
      .load()
      .then((loaded) => {
        if (!alive) return;
        if (loaded) setData(loaded);
      })
      .catch(() => {
        // First run or unreadable store: start from defaults.
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void storage.save(data).catch(() => {
        // Persistence errors are surfaced by the storage adapter in native builds.
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [data, ready]);

  const update = useCallback((mutator: Mutator) => {
    setData((prev) => mutator(prev));
  }, []);

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

      addTask(date, title, categoryId = null) {
        const id = uid("task");
        update((d) => {
          const order =
            d.tasks
              .filter((t) => t.date === date && !t.parentId && !t.deletedAt)
              .reduce((m, t) => Math.max(m, t.order + 1), 0);
          const task: Task = { ...makeTask(date, title.trim(), order), id, categoryId };
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
          const stamp = nowISO();
          return {
            ...d,
            tasks: d.tasks.map((t) =>
              t.id === id || t.parentId === id ? { ...t, date, updatedAt: stamp } : t,
            ),
          };
        });
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
      deleteTask(id) {
        update((d) => {
          const stamp = nowISO();
          return {
            ...d,
            tasks: d.tasks.map((t) =>
              t.id === id || t.parentId === id ? { ...t, deletedAt: stamp, updatedAt: stamp } : t,
            ),
          };
        });
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
            handoff: { status: "not-done" },
          })),
        );
      },
      updateNote(taskId, content) {
        update((d) =>
          patchNote(d, taskId, (note) => ({ ...note, content, handoff: { status: "not-done" } })),
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

      addHabit(title, cadence) {
        update((d) => ({ ...d, habits: [...d.habits, makeHabit(title, cadence)] }));
      },
      toggleHabitDate(id, date) {
        update((d) => ({
          ...d,
          habits: d.habits.map((habit) =>
            habit.id === id
              ? {
                  ...habit,
                  completedDates: habit.completedDates.includes(date)
                    ? habit.completedDates.filter((x) => x !== date)
                    : [...habit.completedDates, date],
                }
              : habit,
          ),
        }));
      },
      deleteHabit(id) {
        update((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) }));
      },

      addCalorie(date, slot, label, kcal) {
        const entry: CalorieEntry = {
          id: uid("cal"),
          date,
          slot,
          label,
          kcal,
          createdAt: nowISO(),
        };
        update((d) => ({ ...d, calories: [...d.calories, entry] }));
      },
      deleteCalorie(id) {
        update((d) => ({ ...d, calories: d.calories.filter((c) => c.id !== id) }));
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
    [update],
  );

  const value = useMemo<StoreValue>(
    () => ({ data, ready, isNative: isTauri, actions }),
    [data, ready, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
