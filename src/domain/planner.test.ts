import { describe, expect, it } from "vitest";
import { dayKcal, onGoal } from "./calories";
import { describeSchedule, ghostsFor } from "./habits";
import {
  makeCalorieEntry,
  makeCategory,
  makeHabit,
  makeTask,
  migrateV2,
  parseAppData,
  type Task,
} from "./model";
import { daySummary, weekSummary } from "./summaries";

const habit = (over = {}) => ({ ...makeHabit("Stretch", "c1", "2026-11-10"), ...over });
const task = (over: Partial<Task>): Task => ({ ...makeTask("2026-11-20", "T", 0), ...over });

describe("ghostsFor", () => {
  it("respects start, end and weekdays", () => {
    const h = habit({ endDate: "2026-11-30" });
    expect(ghostsFor("2026-11-09", [h], [])).toEqual([]);
    expect(ghostsFor("2026-11-10", [h], [])).toHaveLength(1);
    expect(ghostsFor("2026-11-30", [h], [])).toHaveLength(1);
    expect(ghostsFor("2026-12-01", [h], [])).toEqual([]);
    const forever = habit({ endDate: null });
    expect(ghostsFor("2030-01-01", [forever], [])).toHaveLength(1);
    const mwf = habit({ weekdays: [1, 3, 5] });
    expect(ghostsFor("2026-11-20", [mwf], [])).toHaveLength(1); // Fri
    expect(ghostsFor("2026-11-21", [mwf], [])).toEqual([]); // Sat
  });

  it("hides a ghost once a task for that habit exists that day", () => {
    const h = habit();
    const t = task({ habitId: h.id });
    expect(ghostsFor("2026-11-20", [h], [t])).toEqual([]);
    expect(ghostsFor("2026-11-21", [h], [t])).toHaveLength(1);
    expect(ghostsFor("2026-11-20", [h], [{ ...t, deletedAt: "x" }])).toHaveLength(1);
    expect(ghostsFor("2026-11-20", [h], [task({ habitId: "other" })])).toHaveLength(1);
  });

  it("ignores deleted habits and describes schedules", () => {
    expect(ghostsFor("2026-11-20", [habit({ deletedAt: "x" })], [])).toEqual([]);
    expect(describeSchedule(habit({ weekdays: [0, 1] }))).toBe("Mon, Sun");
    expect(describeSchedule(habit())).toBe("Every day");
  });
});

describe("calories", () => {
  const e = (date: string, kcal: number, extra = {}) => ({ ...makeCalorieEntry(date, kcal), ...extra });
  it("sums live entries for the day", () => {
    const entries = [e("2026-11-20", 300), e("2026-11-20", 940), e("2026-11-20", 99, { deletedAt: "x" }), e("2026-11-21", 500)];
    expect(dayKcal(entries, "2026-11-20")).toBe(1240);
    expect(dayKcal(entries, "2026-11-22")).toBe(0);
  });
  it("on goal is within 10%", () => {
    expect(onGoal(1800, 2000)).toBe(true);
    expect(onGoal(2200, 2000)).toBe(true);
    expect(onGoal(2201, 2000)).toBe(false);
    expect(onGoal(0, 2000)).toBe(false);
  });
});

describe("summaries", () => {
  const study = makeCategory("Study", 0);
  const gym = makeCategory("Gym", 1);
  const cats = [study, gym];
  const tasks = [
    task({ id: "1", categoryId: study.id, done: true }),
    task({ id: "2", categoryId: gym.id }),
    task({ id: "3", categoryId: study.id, date: "2026-11-17", done: true }),
    task({ id: "4", categoryId: null, date: "2026-11-18" }),
  ];
  const cal = [
    makeCalorieEntry("2026-11-20", 2000),
    makeCalorieEntry("2026-11-17", 1000),
    makeCalorieEntry("2026-11-17", 1000),
    makeCalorieEntry("2026-11-18", 500),
  ];

  it("day summary", () => {
    const s = daySummary("2026-11-20", tasks, cats, cal, 2000);
    expect(s).toMatchObject({ done: 1, total: 2, kcal: 2000 });
    expect(s.worked.map((w) => w.category?.name)).toEqual(["Study"]);
  });

  it("week summary (Mon 16 - Sun 22)", () => {
    const s = weekSummary("2026-11-16", tasks, cats, cal, 2000);
    expect(s).toMatchObject({ done: 2, total: 4, daysLogged: 3, daysOnGoal: 2 });
    expect(s.kcalAverage).toBe(Math.round((2000 + 2000 + 500) / 3));
    expect(s.perCategory.map((c) => [c.category?.name ?? null, c.done, c.total])).toEqual([
      ["Study", 2, 2],
      ["Gym", 0, 1],
      [null, 0, 1],
    ]);
  });
});

describe("migration v2 -> v3", () => {
  const settings = { handoffFolder: "", learnharnessSubjects: [], dailyCalorieGoal: 2000 };
  const v2 = {
    version: 2,
    tasks: [],
    categories: [],
    habits: [
      { id: "h1", title: "Walk", cadence: "daily", completedDates: ["2026-11-02"], createdAt: "2026-11-01T10:00:00.000Z" },
      { id: "h2", title: "Review", cadence: "weekly", completedDates: [], createdAt: "2026-11-02T10:00:00.000Z" },
    ],
    calories: [{ id: "c1", date: "2026-11-02", slot: "lunch", label: "Soup", kcal: 320, createdAt: "2026-11-02T12:00:00.000Z" }],
    settings,
  };
  it("converts habits and calories", () => {
    const out = migrateV2(v2)!;
    expect(out.version).toBe(4);
    expect(out.habits[0]).toMatchObject({ id: "h1", categoryId: null, startDate: "2026-11-01", endDate: null });
    expect(out.habits[0].weekdays).toBeUndefined();
    expect(out.habits[1].weekdays).toHaveLength(1);
    expect(out.calories[0]).toMatchObject({ kcal: 320, label: "lunch: Soup", updatedAt: "2026-11-02T12:00:00.000Z" });
    expect(parseAppData(v2).version).toBe(4);
  });
});
