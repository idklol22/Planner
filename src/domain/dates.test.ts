import { describe, expect, it } from "vitest";
import {
  addDays,
  fromISODate,
  monthGrid,
  sameMonth,
  weekdayLabels,
  toISODate,
} from "./dates";

describe("date helpers", () => {
  it("round-trips a date through ISO strings", () => {
    const date = new Date(2026, 10, 19);
    expect(toISODate(date)).toBe("2026-11-19");
    expect(toISODate(fromISODate("2026-11-19"))).toBe("2026-11-19");
  });

  it("crosses month and year boundaries when adding days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("labels the week Monday-first when the grid is Monday-first", () => {
    const short = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    expect(weekdayLabels(1)[0]).toBe(short.format(new Date(2024, 0, 8)));
    expect(weekdayLabels(1)[6]).toBe(short.format(new Date(2024, 0, 14)));
  });

  it("builds a stable 6-week grid containing the selected month", () => {
    const grid = monthGrid("2026-11-19");
    expect(grid).toHaveLength(42);
    expect(grid).toContain("2026-11-19");
    expect(grid.some((day) => sameMonth(day, "2026-11-01"))).toBe(true);
  });
});
