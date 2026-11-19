import { z } from "zod";
import { uid } from "./ids";

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

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  tags: z.array(z.string()),
  headingId: z.string().nullable(),
  order: z.number(),
  done: z.boolean(),
  linkedSubjectId: z.string().nullable(),
  note: NoteSchema.nullable(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export const HeadingSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  order: z.number(),
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
  dailyCalorieGoal: z.number(),
});

export const AppDataSchema = z.object({
  version: z.literal(1),
  tasks: z.array(TaskSchema),
  headings: z.array(HeadingSchema),
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
export type Heading = z.infer<typeof HeadingSchema>;
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
  return {
    id: uid("task"),
    title,
    date,
    tags: [],
    headingId: null,
    order,
    done: false,
    linkedSubjectId: null,
    note: null,
    createdAt: new Date().toISOString(),
  };
}

export function makeHeading(date: string, title: string, order: number): Heading {
  return { id: uid("head"), date, title, order };
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
    version: 1,
    tasks: [],
    headings: [],
    habits: [],
    calories: [],
    settings: {
      handoffFolder: "",
      learnharnessSubjects: [],
      dailyCalorieGoal: 2000,
    },
  };
}

/** Parse persisted data; fall back to a clean slate if it is corrupt/outdated. */
export function parseAppData(value: unknown): AppData {
  const result = AppDataSchema.safeParse(value);
  return result.success ? result.data : defaultData();
}
