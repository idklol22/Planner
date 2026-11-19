import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uid } from "../domain/ids";
import type { ISODate } from "../domain/dates";
import {
  defaultData,
  makeHabit,
  makeHeading,
  makeNote,
  makeTask,
  type AppData,
  type CalorieEntry,
  type Habit,
  type MealSlot,
  type Note,
  type Settings,
  type Task,
} from "../domain/model";
import { buildHandoffMarkdown } from "../lib/handoff";
import { isTauri, storage } from "../storage";

type Mutator = (data: AppData) => AppData;

function mapTask(data: AppData, id: string, fn: (task: Task) => Task): AppData {
  return { ...data, tasks: data.tasks.map((task) => (task.id === id ? fn(task) : task)) };
}

function patchNote(
  data: AppData,
  taskId: string,
  patch: Partial<Note["handoff"]>,
): AppData {
  return mapTask(data, taskId, (task) =>
    task.note
      ? {
          ...task,
          note: { ...task.note, handoff: { ...task.note.handoff, ...patch } },
        }
      : task,
  );
}

export interface Actions {
  addTask(date: ISODate, title: string, headingId?: string | null): void;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;
  moveTask(id: string, direction: -1 | 1): void;
  addTag(id: string, tag: string): void;
  removeTag(id: string, tag: string): void;
  linkSubject(id: string, subjectId: string | null): void;

  addHeading(date: ISODate, title: string): void;
  updateHeading(id: string, title: string): void;
  deleteHeading(id: string): void;

  ensureNote(taskId: string): void;
  updateNote(taskId: string, content: string): void;
  addImage(taskId: string, image: { name: string; dataUrl: string }): void;
  removeImage(taskId: string, imageId: string): void;
  markNoteDone(taskId: string): void;
  sendToLearnHarness(taskId: string): Promise<void>;

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

  useEffect(() => {
    let alive = true;
    storage
      .load()
      .then((loaded) => {
        if (!alive) return;
        if (loaded) setData(loaded);
      })
      .catch(() => {
        // First run or unreadable store — start from defaults.
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
      addTask(date, title, headingId = null) {
        update((d) => {
          const order = d.tasks.filter((t) => t.date === date).length;
          const task: Task = { ...makeTask(date, title, order), headingId };
          return { ...d, tasks: [...d.tasks, task] };
        });
      },
      updateTask(id, patch) {
        update((d) => mapTask(d, id, (task) => ({ ...task, ...patch })));
      },
      toggleTask(id) {
        update((d) =>
          mapTask(d, id, (task) => ({
            ...task,
            done: !task.done,
            completedAt: task.done ? undefined : new Date().toISOString(),
          })),
        );
      },
      deleteTask(id) {
        update((d) => ({ ...d, tasks: d.tasks.filter((task) => task.id !== id) }));
      },
      moveTask(id, direction) {
        update((d) => {
          const task = d.tasks.find((t) => t.id === id);
          if (!task) return d;
          const siblings = d.tasks
            .filter((t) => t.date === task.date && t.headingId === task.headingId)
            .sort((a, b) => a.order - b.order);
          const index = siblings.findIndex((t) => t.id === id);
          const target = index + direction;
          if (target < 0 || target >= siblings.length) return d;
          const other = siblings[target];
          return {
            ...d,
            tasks: d.tasks.map((t) => {
              if (t.id === id) return { ...t, order: other.order };
              if (t.id === other.id) return { ...t, order: task.order };
              return t;
            }),
          };
        });
      },
      addTag(id, tag) {
        const clean = tag.trim().toLowerCase();
        if (!clean) return;
        update((d) =>
          mapTask(d, id, (task) =>
            task.tags.includes(clean) ? task : { ...task, tags: [...task.tags, clean] },
          ),
        );
      },
      removeTag(id, tag) {
        update((d) =>
          mapTask(d, id, (task) => ({ ...task, tags: task.tags.filter((t) => t !== tag) })),
        );
      },
      linkSubject(id, subjectId) {
        update((d) => mapTask(d, id, (task) => ({ ...task, linkedSubjectId: subjectId })));
      },

      addHeading(date, title) {
        update((d) => {
          const order = d.headings.filter((h) => h.date === date).length;
          return { ...d, headings: [...d.headings, makeHeading(date, title, order)] };
        });
      },
      updateHeading(id, title) {
        update((d) => ({
          ...d,
          headings: d.headings.map((h) => (h.id === id ? { ...h, title } : h)),
        }));
      },
      deleteHeading(id) {
        update((d) => ({
          ...d,
          headings: d.headings.filter((h) => h.id !== id),
          tasks: d.tasks.map((t) => (t.headingId === id ? { ...t, headingId: null } : t)),
        }));
      },

      ensureNote(taskId) {
        update((d) =>
          mapTask(d, taskId, (task) => (task.note ? task : { ...task, note: makeNote(taskId) })),
        );
      },
      updateNote(taskId, content) {
        update((d) =>
          mapTask(d, taskId, (task) =>
            task.note
              ? {
                  ...task,
                  note: {
                    ...task.note,
                    content,
                    updatedAt: new Date().toISOString(),
                    handoff: { status: "not-done" },
                  },
                }
              : task,
          ),
        );
      },
      addImage(taskId, image) {
        update((d) =>
          mapTask(d, taskId, (task) =>
            task.note
              ? {
                  ...task,
                  note: {
                    ...task.note,
                    images: [
                      ...task.note.images,
                      { id: uid("img"), name: image.name, dataUrl: image.dataUrl },
                    ],
                    updatedAt: new Date().toISOString(),
                  },
                }
              : task,
          ),
        );
      },
      removeImage(taskId, imageId) {
        update((d) =>
          mapTask(d, taskId, (task) =>
            task.note
              ? {
                  ...task,
                  note: {
                    ...task.note,
                    images: task.note.images.filter((image) => image.id !== imageId),
                  },
                }
              : task,
          ),
        );
      },
      markNoteDone(taskId) {
        update((d) =>
          mapTask(d, taskId, (task) => {
            if (!task.note) return task;
            return {
              ...task,
              done: true,
              completedAt: new Date().toISOString(),
              note: {
                ...task.note,
                handoff: {
                  ...task.note.handoff,
                  status: task.linkedSubjectId ? "ready" : "not-done",
                },
              },
            };
          }),
        );
      },
      async sendToLearnHarness(taskId) {
        const task = data.tasks.find((t) => t.id === taskId);
        if (!task?.note || !task.linkedSubjectId) return;
        const { fileName, markdown } = buildHandoffMarkdown(task, task.note, data.settings);
        try {
          const path = await storage.exportNote(
            fileName,
            markdown,
            data.settings.handoffFolder,
          );
          update((d) =>
            patchNote(d, taskId, {
              status: "sent",
              sentAt: new Date().toISOString(),
              fileName: path,
              error: undefined,
            }),
          );
        } catch (error) {
          update((d) =>
            patchNote(d, taskId, {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
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
                    ? habit.completedDates.filter((d) => d !== date)
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
          createdAt: new Date().toISOString(),
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
    [data, update],
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
