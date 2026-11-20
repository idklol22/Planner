import { z } from "zod";
import { uid } from "./ids";

/** Base URL of a locally running LearnHarness dev server. */
export const DEFAULT_HARNESS_URL = "http://localhost:3000";

// ── Schemas ────────────────────────────────────────────────────────────────
export const NoteImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataUrl: z.string(),
});

export const HandoffSchema = z.object({
  status: z.enum(["not-done", "ready", "sent", "failed"]),
  sentAt: z.string().optional(),
  fileName: z.string().optional(),
  error: z.string().optional(),
  /** `finished` flag of the last note sent, so a state flip can be re-sent. */
  finished: z.boolean().optional(),
});

export const NoteSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  content: z.string(),
  images: z.array(NoteImageSchema),
  handoff: HandoffSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TASK_KINDS = [
  "general",
  "class",
  "study",
  "revisit",
  "practice",
  "research",
  "meeting",
] as const;
export const TaskKindSchema = z.enum(TASK_KINDS);

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string().optional(),
  order: z.number(),
  linkedSubjectId: z.string().nullable(),
  /** Optional topic inside the linked LearnHarness subject. */
  linkedTopicId: z.string().nullable().optional(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  categoryId: z.string().nullable(),
  parentId: z.string().nullable(),
  /** Set on a materialised occurrence of a recurring template task. */
  seriesId: z.string().nullable().optional(),
  /** Set when the task was created by accepting a habit's ghost on that day. */
  habitId: z.string().nullable().optional(),
  order: z.number(),
  done: z.boolean(),
  completedAt: z.string().optional(),
  time: z.string().optional(),
  durationMin: z.number().optional(),
  rrule: z.string().optional(),
  deadline: z.boolean(),
  kind: TaskKindSchema,
  note: NoteSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
});

export const HabitSchema = z.object({
  id: z.string(),
  title: z.string(),
  categoryId: z.string().nullable(),
  /** First day the habit applies (YYYY-MM-DD). */
  startDate: z.string(),
  /** Last day it applies, or null = forever. */
  endDate: z.string().nullable(),
  /** 0 = Sunday. Missing or empty = every day. */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
});

export const CalorieEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  kcal: z.number(),
  label: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
});

export const SettingsSchema = z.object({
  /** Absolute path to a folder LearnHarness imports from. Empty = app-data/handoff. */
  handoffFolder: z.string(),
  /** User-managed list of LearnHarness subjects a task can be linked to. */
  learnharnessSubjects: z.array(z.string()),
  /** Base URL of the running LearnHarness dev server. */
  harnessUrl: z.string().default(DEFAULT_HARNESS_URL),
  dailyCalorieGoal: z.number(),
});

export const AppDataSchema = z.object({
  version: z.literal(3),
  tasks: z.array(TaskSchema),
  categories: z.array(CategorySchema),
  habits: z.array(HabitSchema),
  calories: z.array(CalorieEntrySchema),
  settings: SettingsSchema,
});

// ── Types (single source of truth: inferred from schemas) ──────────────────
export type NoteImage = z.infer<typeof NoteImageSchema>;
export type HandoffState = z.infer<typeof HandoffSchema>;
export type HandoffStatus = HandoffState["status"];
export type Note = z.infer<typeof NoteSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
export type Habit = z.infer<typeof HabitSchema>;
export type CalorieEntry = z.infer<typeof CalorieEntrySchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type AppData = z.infer<typeof AppDataSchema>;

// ── Factories ──────────────────────────────────────────────────────────────
export function makeNote(taskId: string): Note {
  const now = new Date().toISOString();
  return {
    id: uid("note"),
    taskId,
    content: "",
    images: [],
    handoff: { status: "not-done" },
    createdAt: now,
    updatedAt: now,
  };
}

export function makeTask(date: string, title: string, order: number): Task {
  const now = new Date().toISOString();
  return {
    id: uid("task"),
    title,
    date,
    categoryId: null,
    parentId: null,
    seriesId: null,
    order,
    done: false,
    deadline: false,
    kind: "general",
    note: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 12 preset category colours, bright enough for a true-black background. */
export const CATEGORY_COLORS = [
  "#FF6B6B",
  "#FF9F43",
  "#FFD166",
  "#A3D977",
  "#34D399",
  "#2DD4BF",
  "#38BDF8",
  "#5B8DEF",
  "#8B7CFF",
  "#C084FC",
  "#F472B6",
  "#D4A373",
] as const;

export function makeCategory(name: string, order: number, color?: string): Category {
  const now = new Date().toISOString();
  return {
    id: uid("cat"),
    name,
    color: color ?? CATEGORY_COLORS[order % CATEGORY_COLORS.length],
    order,
    linkedSubjectId: null,
    linkedTopicId: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeHabit(
  title: string,
  categoryId: string | null,
  startDate: string,
  endDate: string | null = null,
  weekdays?: number[],
): Habit {
  const now = new Date().toISOString();
  return {
    id: uid("habit"),
    title,
    categoryId,
    startDate,
    endDate,
    weekdays: weekdays && weekdays.length > 0 && weekdays.length < 7 ? weekdays : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeCalorieEntry(date: string, kcal: number, label?: string): CalorieEntry {
  const now = new Date().toISOString();
  return {
    id: uid("cal"),
    date,
    kcal,
    label: label?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultData(): AppData {
  return {
    version: 3,
    tasks: [],
    categories: [],
    habits: [],
    calories: [],
    settings: {
      handoffFolder: "",
      learnharnessSubjects: [],
      harnessUrl: DEFAULT_HARNESS_URL,
      dailyCalorieGoal: 2000,
    },
  };
}

// ── Migrations ─────────────────────────────────────────────────────────────
const LegacyHabitSchema = z.object({
  id: z.string(),
  title: z.string(),
  cadence: z.enum(["daily", "weekly"]).optional(),
  completedDates: z.array(z.string()).optional(),
  createdAt: z.string(),
});
const LegacyCalorieSchema = z.object({
  id: z.string(),
  date: z.string(),
  slot: z.string().optional(),
  label: z.string().optional(),
  kcal: z.number(),
  createdAt: z.string(),
});

const V2Schema = z.object({
  version: z.literal(2),
  tasks: z.array(TaskSchema),
  categories: z.array(CategorySchema),
  habits: z.array(LegacyHabitSchema),
  calories: z.array(LegacyCalorieSchema),
  settings: SettingsSchema,
});

/** v2 → v3: habits become scheduled ghost suggestions, calories gain sync stamps. */
export function migrateV2(value: unknown): AppData | null {
  const parsed = V2Schema.safeParse(value);
  if (!parsed.success) return null;
  const v2 = parsed.data;
  const habits: Habit[] = v2.habits.map((h) => {
    const start = h.createdAt.slice(0, 10);
    // A weekly habit has no weekday in v2; anchor it to the weekday it was created on.
    const weekdays =
      h.cadence === "weekly" ? [new Date(`${start}T12:00:00`).getDay()] : undefined;
    return {
      id: h.id,
      title: h.title,
      categoryId: null,
      startDate: start,
      endDate: null,
      weekdays,
      createdAt: h.createdAt,
      updatedAt: h.createdAt,
    };
  });
  const calories: CalorieEntry[] = v2.calories.map((c) => ({
    id: c.id,
    date: c.date,
    kcal: c.kcal,
    label: [c.slot, c.label].filter(Boolean).join(": ") || undefined,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  }));
  return AppDataSchema.parse({ ...v2, version: 3, habits, calories });
}

const V1TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  headingId: z.string().nullable().optional(),
  order: z.number(),
  done: z.boolean(),
  linkedSubjectId: z.string().nullable().optional(),
  note: NoteSchema.partial({ updatedAt: true }).nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});
const V1Schema = z.object({
  version: z.literal(1),
  tasks: z.array(V1TaskSchema),
  headings: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()),
  habits: z.array(LegacyHabitSchema),
  calories: z.array(LegacyCalorieSchema),
  settings: SettingsSchema,
});

/** v1 → v3. Each distinct heading title becomes a category; tasks keep their mapping. */
export function migrateV1(value: unknown): AppData | null {
  const parsed = V1Schema.safeParse(value);
  if (!parsed.success) return null;
  const v1 = parsed.data;
  const categories: Category[] = [];
  const byTitle = new Map<string, Category>();
  const byHeading = new Map<string, Category>();
  for (const heading of v1.headings) {
    const title = heading.title.trim() || "Untitled";
    const key = title.toLowerCase();
    let cat = byTitle.get(key);
    if (!cat) {
      cat = makeCategory(title, categories.length);
      categories.push(cat);
      byTitle.set(key, cat);
    }
    byHeading.set(heading.id, cat);
  }
  const tasks: Task[] = v1.tasks.map((t) => {
    const cat = t.headingId ? (byHeading.get(t.headingId) ?? null) : null;
    if (cat && t.linkedSubjectId && !cat.linkedSubjectId) cat.linkedSubjectId = t.linkedSubjectId;
    return {
      id: t.id,
      title: t.title,
      date: t.date,
      categoryId: cat?.id ?? null,
      parentId: null,
      seriesId: null,
      order: t.order,
      done: t.done,
      completedAt: t.completedAt,
      deadline: false,
      kind: "general" as const,
      note: t.note ? { ...t.note, updatedAt: t.note.updatedAt ?? t.note.createdAt } : null,
      createdAt: t.createdAt,
      updatedAt: t.completedAt ?? t.createdAt,
    };
  });
  return migrateV2({
    version: 2,
    tasks,
    categories,
    habits: v1.habits,
    calories: v1.calories,
    settings: v1.settings,
  });
}

/** Parse persisted data; migrate older versions, fall back to a clean slate if corrupt. */
export function parseAppData(value: unknown): AppData {
  const result = AppDataSchema.safeParse(value);
  if (result.success) return result.data;
  return migrateV2(value) ?? migrateV1(value) ?? defaultData();
}
