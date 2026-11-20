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
  cadence: z.enum(["daily", "weekly"]),
  completedDates: z.array(z.string()),
  createdAt: z.string(),
});

export const MealSlotSchema = z.enum(["breakfast", "lunch", "dinner"]);

export const CalorieEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  slot: MealSlotSchema,
  label: z.string(),
  kcal: z.number(),
  createdAt: z.string(),
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
  version: z.literal(2),
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
export type MealSlot = z.infer<typeof MealSlotSchema>;
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

export function makeHabit(title: string, cadence: Habit["cadence"]): Habit {
  return {
    id: uid("habit"),
    title,
    cadence,
    completedDates: [],
    createdAt: new Date().toISOString(),
  };
}

export function defaultData(): AppData {
  return {
    version: 2,
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

// ── Migration v1 → v2 ──────────────────────────────────────────────────────
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
  habits: z.array(HabitSchema),
  calories: z.array(CalorieEntrySchema),
  settings: SettingsSchema,
});

/** Each distinct heading title becomes a category; tasks keep their mapping. */
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
  return AppDataSchema.parse({
    version: 2,
    tasks,
    categories,
    habits: v1.habits,
    calories: v1.calories,
    settings: v1.settings,
  });
}

/** Parse persisted data; migrate v1, fall back to a clean slate if corrupt. */
export function parseAppData(value: unknown): AppData {
  const result = AppDataSchema.safeParse(value);
  if (result.success) return result.data;
  return migrateV1(value) ?? defaultData();
}
