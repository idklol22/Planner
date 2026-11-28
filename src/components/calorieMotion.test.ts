import { describe, expect, it } from "vitest";
import { COUNT_MS, countAt, easeOut, mergeEntryRows, roundTo } from "./calorieMotion";

describe("easeOut / countAt", () => {
  it("clamps progress and eases towards the target", () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(countAt(100, 200, 0)).toBe(100);
    expect(countAt(100, 200, 1)).toBe(200);
    expect(countAt(100, 200, 0.5)).toBeGreaterThan(150);
  });

  it("uses the shared base duration", () => {
    expect(COUNT_MS).toBe(240);
  });

  it("rounds protein to a stable number of decimals", () => {
    expect(roundTo(20.123, 1)).toBe(20.1);
    expect(roundTo(20.16, 1)).toBe(20.2);
    expect(roundTo(199.6, 0)).toBe(200);
  });
});

type Row = { id: string; kcal: number };

describe("mergeEntryRows", () => {
  it("adds new entries with no exit state", () => {
    expect(mergeEntryRows<Row>([], [{ id: "a", kcal: 10 }])).toEqual([
      { item: { id: "a", kcal: 10 }, leaving: false },
    ]);
  });

  it("keeps a removed entry only as leaving, in its old position", () => {
    const prev = [
      { item: { id: "a", kcal: 10 }, leaving: false },
      { item: { id: "b", kcal: 20 }, leaving: false },
    ];
    expect(mergeEntryRows(prev, [{ id: "a", kcal: 10 }])).toEqual([
      { item: { id: "a", kcal: 10 }, leaving: false },
      { item: { id: "b", kcal: 20 }, leaving: true },
    ]);
  });

  it("cancels a pending exit when the id returns, with fresh data", () => {
    const prev = [{ item: { id: "a", kcal: 10 }, leaving: true }];
    expect(mergeEntryRows(prev, [{ id: "a", kcal: 30 }])).toEqual([
      { item: { id: "a", kcal: 30 }, leaving: false },
    ]);
  });

  it("shows updated values for rows that stay", () => {
    const prev = [{ item: { id: "a", kcal: 10 }, leaving: false }];
    expect(mergeEntryRows(prev, [{ id: "a", kcal: 40 }])[0].item.kcal).toBe(40);
  });
});
