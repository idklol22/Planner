import { describe, expect, it } from "vitest";
import { calendarHeatLevel } from "./calendar";

describe("calendarHeatLevel", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [25, 4],
  ] as const)("maps %i tasks to level %i", (count, level) => {
    expect(calendarHeatLevel(count)).toBe(level);
  });

  it("treats negative and non-finite counts as empty", () => {
    expect(calendarHeatLevel(-1)).toBe(0);
    expect(calendarHeatLevel(-25)).toBe(0);
    expect(calendarHeatLevel(Number.NaN)).toBe(0);
    expect(calendarHeatLevel(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
