import { describe, expect, it } from "vitest";
import type { Habit } from "./model";
import { describeSchedule, partitionHabits } from "./habits";

function habit(id: string, createdAt: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    categoryId: null,
    startDate: "2026-01-01",
    endDate: null,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

const ids = (habits: Habit[]) => habits.map((h) => h.id);

describe("partitionHabits", () => {
  it("splits on deletedAt", () => {
    const live = habit("live", "2026-01-01T00:00:00Z");
    const archived = habit("archived", "2026-01-02T00:00:00Z", {
      deletedAt: "2026-02-01T00:00:00Z",
    });
    const result = partitionHabits([live, archived]);

    expect(ids(result.active)).toEqual(["live"]);
    expect(ids(result.archived)).toEqual(["archived"]);
  });

  it("sorts each list by createdAt then title", () => {
    const result = partitionHabits([
      habit("b-late", "2026-02-01T00:00:00Z", { title: "Zebra" }),
      habit("a-late", "2026-02-01T00:00:00Z", { title: "Apple" }),
      habit("b-early", "2026-01-01T00:00:00Z", { deletedAt: "2026-03-01T00:00:00Z" }),
      habit("a-early", "2026-01-01T00:00:00Z", {
        title: "Apple",
        deletedAt: "2026-03-01T00:00:00Z",
      }),
    ]);

    expect(ids(result.active)).toEqual(["a-late", "b-late"]);
    expect(ids(result.archived)).toEqual(["a-early", "b-early"]);
  });

  it("returns independent arrays and leaves the input untouched", () => {
    const first = habit("first", "2026-02-01T00:00:00Z");
    const second = habit("second", "2026-01-01T00:00:00Z");
    const input = [first, second];
    const result = partitionHabits(input);

    expect(result.active).not.toBe(result.archived);
    expect(result.active).not.toBe(input);
    expect(result.archived).not.toBe(input);
    expect(ids(input)).toEqual(["first", "second"]);

    result.active.pop();
    result.archived.push(first);
    expect(ids(result.active)).toEqual(["second"]);
    expect(ids(input)).toEqual(["first", "second"]);
  });
});

describe("describeSchedule", () => {
  it("describes every-day schedules", () => {
    expect(describeSchedule(habit("h", "2026-01-01T00:00:00Z"))).toBe("Every day");
    expect(
      describeSchedule(habit("h", "2026-01-01T00:00:00Z", { weekdays: [] })),
    ).toBe("Every day");
    expect(
      describeSchedule(habit("h", "2026-01-01T00:00:00Z", { weekdays: [0, 1, 2, 3, 4, 5, 6] })),
    ).toBe("Every day");
  });

  it("describes Monday / Wednesday / Friday, Monday first", () => {
    const h = habit("h", "2026-01-01T00:00:00Z", { weekdays: [5, 1, 3] });
    expect(describeSchedule(h)).toBe("Mon, Wed, Fri");
  });

  it("appends the end date when one is set", () => {
    const weekly = habit("h", "2026-01-01T00:00:00Z", {
      weekdays: [1, 3, 5],
      endDate: "2026-12-31",
    });
    expect(describeSchedule(weekly)).toBe("Mon, Wed, Fri until 2026-12-31");

    const daily = habit("h", "2026-01-01T00:00:00Z", { endDate: "2026-12-31" });
    expect(describeSchedule(daily)).toBe("Every day until 2026-12-31");
  });
});
