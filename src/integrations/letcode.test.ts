import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultData,
  makeCategory,
  makeTask,
  type AppData,
  type Settings,
} from "../domain/model";
import {
  applySolved,
  parseProblemRef,
  practiceStats,
  type AddTaskOp,
  type PracticeSolvedInput,
} from "./letcode";

const DAY = "2026-11-20";
const STAMP = "2026-11-20T10:00:00.000Z";

function solved(overrides: Partial<PracticeSolvedInput> = {}): PracticeSolvedInput {
  return {
    type: "practice.solved",
    source: "letcode",
    problemId: 125,
    title: "Valid Palindrome",
    difficulty: "Easy",
    solvedAt: STAMP,
    idempotencyKey: `letcode:125:${STAMP}`,
    ...overrides,
  };
}

function dataWith(...titles: string[]): { data: AppData; ids: string[] } {
  const data = defaultData();
  const ids = titles.map((title, order) => {
    const task = makeTask(DAY, title, order);
    data.tasks.push(task);
    return task.id;
  });
  return { data, ids };
}

describe("parseProblemRef", () => {
  it.each([
    ["lc125", 125],
    ["LC 125", 125],
    ["#125", 125],
    ["125.", 125],
    ["LeetCode #125 — Valid Palindrome", 125],
    ["lc-125 Valid Palindrome", 125],
    ["Problem 125: Valid Palindrome", 125],
    ["125 Valid Palindrome", 125],
  ])("finds the problem id in %s", (title, expected) => {
    expect(parseProblemRef(title)).toBe(expected);
  });

  it.each(["Valid Palindrome", "2026-11-20", "lc", "#", "", "Day 3 of revision"])(
    "returns null for %s",
    (title) => {
      expect(parseProblemRef(title)).toBeNull();
    },
  );
});

describe("applySolved", () => {
  it("ticks an open task whose title contains the problem id", () => {
    const { data, ids } = dataWith("lc125 — Valid Palindrome");
    const ops = applySolved(data, solved(), DAY);

    expect(ops).toEqual([{ kind: "toggle", taskId: ids[0] }]);
  });

  it("ticks a task whose title is the exact problem title, ignoring case", () => {
    const { data, ids } = dataWith("  valid   palindrome ");
    const ops = applySolved(data, solved(), DAY);

    expect(ops).toEqual([{ kind: "toggle", taskId: ids[0] }]);
  });

  it("does not tick completed tasks or tasks on another date", () => {
    const { data } = dataWith("LC 125");
    data.tasks[0].done = true;
    const other = makeTask("2026-11-19", "LC 125", 1);
    data.tasks.push(other);
    const daily = makeCategory("Daily", 0);
    data.categories.push(daily);

    const ops = applySolved(data, solved(), DAY);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "add", categoryId: daily.id });
    expect(ops[0]).not.toMatchObject({ taskId: other.id });
  });

  it("adds a done practice task to the Daily category when nothing matches", () => {
    const data = defaultData();
    const work = makeCategory("Work", 0);
    const daily = makeCategory("Daily", 1);
    data.categories.push(work, daily);

    const ops = applySolved(data, solved(), DAY);

    expect(ops).toEqual([
      {
        kind: "add",
        categoryId: daily.id,
        title: "LC 125 · Valid Palindrome",
        date: DAY,
        done: true,
        taskKind: "practice",
      },
    ]);
    expect((ops[0] as AddTaskOp).task).toEqual({
      categoryId: daily.id,
      title: "LC 125 · Valid Palindrome",
      date: DAY,
      done: true,
      kind: "practice",
    });
  });

  it("uses letcodeCategoryId when configured, otherwise the first category", () => {
    const data = defaultData();
    const first = makeCategory("Misc", 0);
    const daily = makeCategory("Daily", 1);
    data.categories.push(first, daily);
    expect(applySolved(data, solved({ idempotencyKey: "k1" }), DAY)[0]).toMatchObject({
      categoryId: daily.id,
    });

    (data.settings as Settings & { letcodeCategoryId?: string }).letcodeCategoryId = first.id;
    expect(applySolved(data, solved({ idempotencyKey: "k2" }), DAY)[0]).toMatchObject({
      categoryId: first.id,
    });

    delete (data.settings as Settings & { letcodeCategoryId?: string }).letcodeCategoryId;
    data.categories.splice(1, 1);
    expect(applySolved(data, solved({ idempotencyKey: "k3" }), DAY)[0]).toMatchObject({
      categoryId: first.id,
    });
  });

  it("never acts twice for the same idempotency key", () => {
    const data = defaultData();
    data.categories.push(makeCategory("Daily", 0));
    const processed = new Set<string>();

    const first = applySolved(data, solved(), DAY, processed);
    const second = applySolved(data, solved(), DAY, first.processed);

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(first.processed).toBe(processed);
    expect(processed.has(`letcode:125:${STAMP}`)).toBe(true);
  });

  it("skips unrelated events", () => {
    const data = defaultData();
    data.categories.push(makeCategory("Daily", 0));

    expect(applySolved(data, solved({ type: "harness.mirrored" }), DAY)).toEqual([]);
    expect(applySolved(data, solved({ source: "web" }), DAY)).toEqual([]);
  });
});

describe("practiceStats", () => {
  afterEach(() => vi.useRealTimers());

  it("counts solves within the range, by difficulty, and the longest streak", () => {
    const events = [
      solved({
        problemId: 1,
        title: "One",
        difficulty: "Easy",
        solvedAt: "2026-11-20T09:00:00.000Z",
        idempotencyKey: "k1",
      }),
      solved({
        problemId: 2,
        title: "Two",
        difficulty: "Medium",
        solvedAt: "2026-11-21T09:00:00.000Z",
        idempotencyKey: "k2",
      }),
      // A duplicate delivery of the same event counts only once.
      solved({
        problemId: 2,
        title: "Two",
        difficulty: "Medium",
        solvedAt: "2026-11-21T09:00:00.000Z",
        idempotencyKey: "k2",
      }),
      solved({
        problemId: 3,
        title: "Three",
        difficulty: "Easy",
        solvedAt: "2026-11-22T09:00:00.000Z",
        idempotencyKey: "k3",
      }),
      solved({
        problemId: 4,
        title: "Four",
        difficulty: "Hard",
        solvedAt: "2026-11-24T09:00:00.000Z",
        idempotencyKey: "k4",
      }),
      solved({
        problemId: 5,
        title: "Outside",
        difficulty: "Hard",
        solvedAt: "2026-11-25T09:00:00.000Z",
        idempotencyKey: "k5",
      }),
    ];

    expect(practiceStats(events, { from: "2026-11-20", to: "2026-11-24" })).toEqual({
      solved: 4,
      byDifficulty: { Easy: 2, Medium: 1, Hard: 1 },
      streakDays: 3,
    });
  });

  it("accepts a tuple, a single day and a rolling number of days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 22, 12, 0, 0));
    const events = [
      solved({
        problemId: 1,
        solvedAt: "2026-11-20T09:00:00.000Z",
        idempotencyKey: "a",
      }),
      solved({
        problemId: 2,
        solvedAt: "2026-11-22T09:00:00.000Z",
        idempotencyKey: "b",
      }),
    ];

    expect(practiceStats(events, ["2026-11-20", "2026-11-20"]).solved).toBe(1);
    expect(practiceStats(events, "2026-11-22").solved).toBe(1);
    expect(practiceStats(events, 3)).toEqual({
      solved: 2,
      byDifficulty: { Easy: 2 },
      streakDays: 1,
    });
  });
});
