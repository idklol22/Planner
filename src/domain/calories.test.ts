import { describe, expect, it } from "vitest";
import { dayKcal, entriesForDay, entryTimeLabel, onGoal } from "./calories";
import { makeCalorieEntry, type CalorieEntry } from "./model";

const DAY = "2026-11-27";
const ISO = "2026-11-27T13:42:00.000Z";

describe("entryTimeLabel", () => {
  it("formats a UTC ISO string with the device locale/timezone", () => {
    const entry: CalorieEntry = { ...makeCalorieEntry(DAY, 200), createdAt: ISO };
    expect(entryTimeLabel(entry)).toBe(
      new Date(ISO).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
  });
});

describe("entriesForDay", () => {
  it("keeps entries newest-last and excludes tombstones", () => {
    const old = { ...makeCalorieEntry(DAY, 100), id: "old", createdAt: "2026-11-27T08:00:00.000Z" };
    const tombstone = {
      ...makeCalorieEntry(DAY, 900),
      id: "gone",
      createdAt: "2026-11-27T10:00:00.000Z",
      deletedAt: "2026-11-27T12:00:00.000Z",
    };
    const newOne = { ...makeCalorieEntry(DAY, 200), id: "new", createdAt: ISO };
    const otherDay = {
      ...makeCalorieEntry("2026-11-28", 300),
      id: "other",
      createdAt: "2026-11-28T09:00:00.000Z",
    };

    expect(entriesForDay([newOne, tombstone, otherDay, old], DAY).map((e) => e.id)).toEqual([
      "old",
      "new",
    ]);
  });
});

describe("dayKcal with legacy labelled entries", () => {
  it("still sums entries that carry an old label", () => {
    const labelled = makeCalorieEntry(DAY, 550, "lunch");
    expect(labelled.label).toBe("lunch");
    const total = dayKcal([labelled, makeCalorieEntry(DAY, 450)], DAY);
    expect(total).toBe(1000);
    expect(onGoal(total, 1000)).toBe(true);
  });
});
