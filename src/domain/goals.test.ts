import { describe, expect, it } from "vitest";
import { achievedGoals, openGoals, reorderedIds } from "./goals";
import { AppDataSchema, defaultData, makeGoal, migrateV3, parseAppData, type CategoryGoal } from "./model";

const g = (id: string, cat: string, order: number, extra: Partial<CategoryGoal> = {}): CategoryGoal => ({
  ...makeGoal(cat, id, order),
  id,
  ...extra,
});

describe("category goals", () => {
  const goals = [
    g("a", "c1", 1),
    g("b", "c1", 0),
    g("c", "c1", 2, { achievedAt: "2026-01-02T00:00:00Z" }),
    g("d", "c1", 3, { achievedAt: "2026-02-01T00:00:00Z" }),
    g("e", "c1", 4, { deletedAt: "2026-01-01T00:00:00Z" }),
    g("f", "c2", 0),
  ];
  it("open goals are per category, ordered, without deleted or achieved", () => {
    expect(openGoals(goals, "c1").map((x) => x.id)).toEqual(["b", "a"]);
    expect(openGoals(goals, null)).toEqual([]);
  });
  it("achieved goals are newest first", () => {
    expect(achievedGoals(goals, "c1").map((x) => x.id)).toEqual(["d", "c"]);
  });
  it("reorders", () => {
    const open = openGoals(goals, "c1");
    expect(reorderedIds(open, "b", 1)).toEqual(["a", "b"]);
    expect(reorderedIds(open, "zzz", 0)).toEqual(["b", "a"]);
  });
  it("v3 data migrates to v4 with empty goals; v4 round-trips", () => {
    const { goals: _goals, ...rest } = defaultData();
    const v3 = { ...rest, version: 3 };
    const out = migrateV3(v3)!;
    expect(out.version).toBe(4);
    expect(out.goals).toEqual([]);
    expect(parseAppData(v3).version).toBe(4);
    const v4 = { ...defaultData(), goals: [g("a", "c1", 0)] };
    expect(AppDataSchema.parse(JSON.parse(JSON.stringify(v4))).goals).toHaveLength(1);
  });
});
