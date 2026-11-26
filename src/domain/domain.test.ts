import { describe, expect, it } from "vitest";
import {
  AppDataSchema,
  makeCategory,
  makeTask,
  migrateV1,
  parseAppData,
  type Category,
  type Task,
} from "./model";
import { materializeOccurrences, ruleMatches } from "./recurrence";
import { daySummary, sectionsForDay, subtaskProgress } from "./tasks";

function task(over: Partial<Task>): Task {
  return { ...makeTask("2026-11-20", "T", 0), ...over };
}

const base = { tags: [], linkedSubjectId: null, note: null, createdAt: "2026-11-01T00:00:00.000Z" };

describe("migration v1 -> v2", () => {
  const v1 = {
    version: 1,
    tasks: [
      { ...base, id: "a", title: "Read", date: "2026-11-20", headingId: "h1", order: 0, done: false, linkedSubjectId: "Biology" },
      { ...base, id: "b", title: "Lift", date: "2026-11-20", headingId: "h2", order: 1, done: true, completedAt: "2026-11-02T00:00:00.000Z" },
      { ...base, id: "c", title: "Loose", date: "2026-11-21", headingId: null, order: 0, done: false },
      { ...base, id: "d", title: "Read more", date: "2026-11-22", headingId: "h3", order: 0, done: false },
    ],
    headings: [
      { id: "h1", date: "2026-11-20", title: "Study", order: 0 },
      { id: "h2", date: "2026-11-20", title: "Gym", order: 1 },
      { id: "h3", date: "2026-11-22", title: "study", order: 0 },
    ],
    habits: [],
    calories: [],
    settings: { handoffFolder: "", learnharnessSubjects: ["Biology"], dailyCalorieGoal: 2000 },
  };

  it("turns distinct heading titles into categories and keeps tasks", () => {
    const out = migrateV1(v1)!;
    expect(AppDataSchema.safeParse(out).success).toBe(true);
    expect(out.version).toBe(4);
    expect(out.categories.map((c) => c.name)).toEqual(["Study", "Gym"]);
    const study = out.categories[0];
    expect(study.linkedSubjectId).toBe("Biology");
    const byId = Object.fromEntries(out.tasks.map((t) => [t.id, t]));
    expect(byId.a.categoryId).toBe(study.id);
    expect(byId.d.categoryId).toBe(study.id);
    expect(byId.c.categoryId).toBeNull();
    expect(byId.b.done).toBe(true);
    expect(out.tasks).toHaveLength(4);
  });

  it("parseAppData migrates v1 and falls back on garbage", () => {
    expect(parseAppData(v1).version).toBe(4);
    expect(parseAppData({ nope: 1 }).tasks).toEqual([]);
  });
});

describe("archived tasks in persistence", () => {
  it("parseAppData keeps archivedAt on current and older records", () => {
    const archived = task({ id: "a", archivedAt: "2026-11-21T10:00:00.000Z" });
    const out = parseAppData({
      version: 4,
      tasks: [archived, task({ id: "live" })],
      categories: [],
      habits: [],
      calories: [],
      goals: [],
      settings: { handoffFolder: "", learnharnessSubjects: [], dailyCalorieGoal: 2000 },
    });
    expect(out.tasks[0].archivedAt).toBe("2026-11-21T10:00:00.000Z");
    expect(out.tasks[1].archivedAt).toBeUndefined();
    expect(AppDataSchema.safeParse(out).success).toBe(true);
  });
});

describe("recurrence", () => {
  it("matches rules", () => {
    expect(ruleMatches("daily", "2026-11-20", "2026-11-25")).toBe(true);
    expect(ruleMatches("daily", "2026-11-20", "2026-11-19")).toBe(false);
    expect(ruleMatches("weekdays", "2026-11-20", "2026-11-21")).toBe(false); // Sat
    expect(ruleMatches("weekdays", "2026-11-20", "2026-11-23")).toBe(true); // Mon
    expect(ruleMatches("weekly", "2026-11-20", "2026-11-27")).toBe(true);
    expect(ruleMatches("weekly", "2026-11-20", "2026-11-26")).toBe(false);
    expect(ruleMatches("days:1,3", "2026-11-01", "2026-11-25")).toBe(true); // Wed
    expect(ruleMatches("days:1,3", "2026-11-01", "2026-11-24")).toBe(false);
  });

  it("materialises idempotently and never resurrects deleted or archived days", () => {
    const tpl = task({ id: "tpl", rrule: "daily", categoryId: "c1", time: "09:00" });
    const days = ["2026-11-20", "2026-11-21", "2026-11-22"];
    const first = materializeOccurrences([tpl], days);
    expect(first.map((t) => t.date)).toEqual(["2026-11-21", "2026-11-22"]);
    expect(first[0]).toMatchObject({ seriesId: "tpl", parentId: null, done: false, time: "09:00", categoryId: "c1" });
    expect(first[0].rrule).toBeUndefined();
    const all = [tpl, ...first];
    expect(materializeOccurrences(all, days)).toEqual([]);
    const deleted = all.map((t) => (t.date === "2026-11-21" ? { ...t, deletedAt: "x" } : t));
    expect(materializeOccurrences(deleted, days)).toEqual([]);
    // An archived occurrence counts as present: it never comes back on its own day.
    const archived = all.map((t) => (t.date === "2026-11-21" ? { ...t, archivedAt: "x" } : t));
    expect(materializeOccurrences(archived, days)).toEqual([]);
    // An archived template stops generating new occurrences altogether.
    expect(materializeOccurrences([{ ...tpl, archivedAt: "x" }], days)).toEqual([]);
  });
  it("does not generate from an archived template, and never resurrects an archived occurrence", () => {
    const tpl = task({ id: "tpl", rrule: "daily", categoryId: "c1" });
    const days = ["2026-11-20", "2026-11-21", "2026-11-22"];
    expect(materializeOccurrences([{ ...tpl, archivedAt: "x" }], days)).toEqual([]);

    const first = materializeOccurrences([tpl], days);
    const archived = first.map((t) => (t.date === "2026-11-21" ? { ...t, archivedAt: "x" } : t));
    expect(materializeOccurrences([tpl, ...archived], days)).toEqual([]);
  });

  it("parseAppData keeps archivedAt (old records without it still parse)", () => {
    const parsed = parseAppData({
      version: 4,
      tasks: [{ ...makeTask("2026-11-20", "Archived", 0), archivedAt: "2026-11-21T10:00:00.000Z" }],
      categories: [],
      habits: [],
      calories: [],
      goals: [],
      settings: { handoffFolder: "", learnharnessSubjects: [], dailyCalorieGoal: 2000 },
    });
    expect(parsed.tasks[0].archivedAt).toBe("2026-11-21T10:00:00.000Z");
    expect(task({}).archivedAt).toBeUndefined();
  });
});

describe("day summary and sections", () => {
  const cats: Category[] = [makeCategory("Study", 0, "#111111"), makeCategory("Gym", 1, "#222222")];
  const [study, gym] = cats;

  it("counts open tasks and picks the main category colour", () => {
    const tasks = [
      task({ id: "1", categoryId: gym.id }),
      task({ id: "2", categoryId: study.id }),
      task({ id: "3", categoryId: study.id, done: true }),
      task({ id: "4", categoryId: study.id, parentId: "1" }), // subtask ignored
      task({ id: "5", categoryId: study.id, deletedAt: "x" }), // deleted ignored
    ];
    expect(daySummary(tasks, cats, "2026-11-20")).toMatchObject({
      total: 3,
      open: 2,
      done: 1,
      allDone: false,
      color: "#111111",
    });
  });

  it("reports all done and an empty day", () => {
    const tasks = [task({ id: "1", categoryId: gym.id, done: true })];
    expect(daySummary(tasks, cats, "2026-11-20")).toMatchObject({ allDone: true, color: "#222222" });
    expect(daySummary(tasks, cats, "2026-11-21")).toMatchObject({ total: 0, allDone: false, color: null });
  });

  it("drops archived tasks and their subtasks from counts", () => {
    const tasks = [
      task({ id: "1", categoryId: gym.id, done: true }),
      task({ id: "2", categoryId: study.id, archivedAt: "2026-11-20T10:00:00.000Z" }),
      task({ id: "3", categoryId: study.id, parentId: "2" }), // subtask of an archived parent
    ];
    expect(daySummary(tasks, cats, "2026-11-20")).toMatchObject({
      total: 1,
      open: 0,
      done: 1,
      allDone: true,
      color: "#222222",
    });
  });

  it("groups by category order with uncategorised last and options", () => {
    const tasks = [
      task({ id: "1", categoryId: gym.id, order: 1 }),
      task({ id: "2", categoryId: null }),
      task({ id: "3", categoryId: gym.id, done: true, order: 0 }),
    ];
    const all = sectionsForDay(tasks, cats, "2026-11-20");
    expect(all.map((s) => s.category?.name ?? null)).toEqual(["Study", "Gym", null]);
    expect(all[1].tasks.map((t) => t.id)).toEqual(["3", "1"]);
    expect(sectionsForDay(tasks, cats, "2026-11-20", { hideEmpty: true }).map((s) => s.tasks.length)).toEqual([2, 1]);
    expect(sectionsForDay(tasks, cats, "2026-11-20", { showCompleted: false })[1].tasks.map((t) => t.id)).toEqual(["1"]);
  });
});

describe("subtask progress", () => {
  it("counts live subtasks of a parent", () => {
    const tasks = [
      task({ id: "p" }),
      task({ id: "s1", parentId: "p", done: true }),
      task({ id: "s2", parentId: "p" }),
      task({ id: "s3", parentId: "p", deletedAt: "x" }),
      task({ id: "o", parentId: "other" }),
    ];
    expect(subtaskProgress(tasks, "p")).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress(tasks, "none")).toEqual({ done: 0, total: 0 });
  });
});
