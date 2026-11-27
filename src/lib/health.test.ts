import { describe, expect, it } from "vitest";
import {
  describeSavedHealth,
  healthLine,
  mergeHealthDay,
  parseHealthData,
  parseHealthNumber,
  parseHealthUrl,
  sanitizeHealthData,
  serializeHealthData,
  toHealthRow,
  type HealthRecord,
} from "./health";

const DAY = "2026-11-27";
const NOW = "2026-11-27T12:00:00.000Z";

describe("parseHealthNumber", () => {
  it("accepts separators and unit suffixes", () => {
    expect(parseHealthNumber("8,000", "steps")).toBe(8000);
    expect(parseHealthNumber("420 kcal", "activeKcal")).toBe(420);
    expect(parseHealthNumber("7.5 h", "sleepHours")).toBe(7.5);
    expect(parseHealthNumber("58 bpm", "restingHr")).toBe(58);
    expect(parseHealthNumber("5.2 km", "distanceKm")).toBe(5.2);
  });

  it("ignores invalid and out-of-range values", () => {
    expect(parseHealthNumber("-1", "steps")).toBeNull();
    expect(parseHealthNumber("1,000,001", "steps")).toBeNull();
    expect(parseHealthNumber("50001", "activeKcal")).toBeNull();
    expect(parseHealthNumber("25", "sleepHours")).toBeNull();
    expect(parseHealthNumber("abc", "restingHr")).toBeNull();
  });
});

describe("parseHealthUrl", () => {
  it("reads every field and defaults the date to today", () => {
    expect(
      parseHealthUrl(
        "planner://health?active=420&steps=8,000&exercise=30&distance=5.2&sleep=7.5&hr=58",
        DAY,
      ),
    ).toEqual({
      date: DAY,
      activeKcal: 420,
      steps: 8000,
      exerciseMin: 30,
      distanceKm: 5.2,
      sleepHours: 7.5,
      restingHr: 58,
    });
  });

  it("honours an explicit valid date", () => {
    expect(parseHealthUrl("planner://health?date=2026-11-20&steps=100", DAY)).toMatchObject({
      date: "2026-11-20",
      steps: 100,
    });
  });

  it("ignores invalid values and requires at least one", () => {
    expect(parseHealthUrl("planner://health?steps=nope&hr=-5", DAY)).toBeNull();
    expect(parseHealthUrl("planner://health?steps=20&sleep=99", DAY)).toEqual({ date: DAY, steps: 20 });
  });

  it("rejects other schemes and hosts, and ignores a bad date", () => {
    expect(parseHealthUrl("https://example.com?steps=20", DAY)).toBeNull();
    expect(parseHealthUrl("planner://today?steps=20", DAY)).toBeNull();
    expect(parseHealthUrl("planner://health?date=2026-02-30&steps=20", DAY)).toEqual({
      date: DAY,
      steps: 20,
    });
  });
});

describe("mergeHealthDay", () => {
  const stored: HealthRecord = {
    date: DAY,
    source: "shortcut",
    updatedAt: "2026-11-27T08:00:00.000Z",
    activeKcal: 400,
    steps: 7000,
    sleepHours: 7,
    workouts: [],
  };

  it("replaces only supplied fields", () => {
    const { record, changed } = mergeHealthDay(stored, { date: DAY, steps: 8000 }, "healthkit", NOW);
    expect(changed).toBe(true);
    expect(record).toMatchObject({ activeKcal: 400, steps: 8000, sleepHours: 7, source: "healthkit", updatedAt: NOW });
  });

  it("never erases a stored field with a missing value", () => {
    const { record, changed } = mergeHealthDay(stored, { date: DAY, activeKcal: null }, "healthkit", NOW);
    expect(changed).toBe(false);
    expect(record.activeKcal).toBe(400);
    expect(record.updatedAt).toBe(stored.updatedAt);
  });

  it("starts a new day with nulls for unknown fields", () => {
    const { record } = mergeHealthDay(undefined, { date: DAY, steps: 8000 }, "shortcut", NOW);
    expect(toHealthRow(record)).toEqual({
      id: `health_${DAY}`,
      date: DAY,
      activeKcal: null,
      steps: 8000,
      exerciseMin: null,
      distanceKm: null,
      sleepHours: null,
      restingHr: null,
      workouts: [],
      source: "shortcut",
      updatedAt: NOW,
      deletedAt: null,
    });
  });
});

describe("persistence", () => {
  it("round-trips validated days and skips corrupt entries", () => {
    const record: HealthRecord = {
      date: DAY,
      source: "healthkit",
      updatedAt: NOW,
      activeKcal: 410,
      steps: 8000,
      workouts: [{ type: "Run", minutes: 30, kcal: 250 }],
    };
    const data = sanitizeHealthData({ [DAY]: record, "not-a-date": record });
    expect(parseHealthData(serializeHealthData(data))[DAY]).toMatchObject({
      activeKcal: 410,
      steps: 8000,
      workouts: [{ type: "Run", minutes: 30, kcal: 250 }],
    });
    expect(parseHealthData("not json")).toEqual({});
  });
});

it("formats a quiet health line", () => {
  expect(healthLine({ date: DAY, activeKcal: 410, steps: 8000 })).toBe("Burned 410 kcal · 8,000 steps");
  expect(healthLine(null)).toBe("");
  expect(describeSavedHealth({ date: DAY, activeKcal: 410, steps: 8000 })).toContain("410 kcal, 8,000 steps");
});
