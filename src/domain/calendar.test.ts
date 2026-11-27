import { describe, expect, it } from "vitest";
import { dayTiles } from "./calendar";
import { makeCategory, makeTask, type Task } from "./model";

const DAY = "2026-11-27";
const math = makeCategory("Math", 0, "#111111");
const home = makeCategory("Home", 1, "#222222");

function task(title: string, categoryId: string | null, done = false): Task {
  return { ...makeTask(DAY, title, 0), categoryId, done };
}

describe("dayTiles", () => {
  it("puts finished tasks first, then follows category order", () => {
    const tasks = [task("b", home.id), task("a", math.id), task("c", home.id, true), task("d", null)];
    const result = dayTiles(tasks, [math, home], DAY, 5);
    expect(result.tiles.map((t) => [t.color, t.done])).toEqual([
      ["#222222", true],
      ["#111111", false],
      ["#222222", false],
      [null, false],
    ]);
    expect(result).toMatchObject({ total: 4, done: 1, more: 0 });
  });

  it("keeps open tasks in view and counts the rest when a day overflows", () => {
    const tasks = [
      ...[1, 2, 3, 4].map((n) => task(`done ${n}`, math.id, true)),
      ...[1, 2, 3].map((n) => task(`open ${n}`, home.id)),
    ];
    const result = dayTiles(tasks, [math, home], DAY, 5);
    expect(result.tiles).toHaveLength(4);
    expect(result.tiles.filter((t) => !t.done)).toHaveLength(3);
    expect(result.tiles[0].done).toBe(true);
    expect(result.more).toBe(3);
  });

  it("shows only open tasks when they alone overflow", () => {
    const tasks = [task("done", math.id, true), ...[1, 2, 3, 4, 5, 6].map((n) => task(`open ${n}`, math.id))];
    const result = dayTiles(tasks, [math], DAY, 4);
    expect(result.tiles.map((t) => t.done)).toEqual([false, false, false]);
    expect(result.more).toBe(4);
  });

  it("ignores other days, subtasks and deleted tasks", () => {
    const tasks = [
      { ...task("other day", null), date: "2026-11-28" },
      { ...task("sub", null), parentId: "x" },
      { ...task("gone", null), deletedAt: "2026-11-27T00:00:00.000Z" },
    ];
    expect(dayTiles(tasks, [], DAY, 5)).toEqual({ tiles: [], more: 0, total: 0, done: 0 });
  });
});
