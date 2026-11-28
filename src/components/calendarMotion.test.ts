import { describe, expect, it } from "vitest";
import {
  pageDirection,
  PAGE_COMMIT_PX,
  PAGE_LOCK_PX,
  PAGE_MAX_PX,
  resolvePageGesture,
  selectedCellIndex,
  type PageGestureInput,
} from "./calendarMotion";

const START_X = 200;
const START_Y = 100;

function sample(over: Partial<PageGestureInput> = {}) {
  return resolvePageGesture({
    pointerType: "touch",
    startX: START_X,
    startY: START_Y,
    x: START_X,
    y: START_Y,
    axis: null,
    pointerDown: true,
    ...over,
  });
}

describe("resolvePageGesture", () => {
  it("exports the documented thresholds", () => {
    expect(PAGE_LOCK_PX).toBe(8);
    expect(PAGE_COMMIT_PX).toBe(56);
    expect(PAGE_MAX_PX).toBe(160);
  });

  it("ignores mouse pointers and releases before an axis was locked", () => {
    expect(sample({ pointerType: "mouse", x: START_X - 100 })).toEqual({ axis: null, dx: 0, step: 0 });
    expect(sample({ pointerDown: false, x: START_X - 100 })).toEqual({ axis: null, dx: 0, step: 0 });
  });

  it("does not move below the lock threshold", () => {
    expect(sample({ x: START_X - 7 })).toEqual({ axis: null, dx: 0, step: 0 });
  });

  it("follows the finger 1:1 once locked horizontally", () => {
    expect(sample({ x: START_X - 12 })).toMatchObject({ axis: "x", dx: -12, step: 0 });
    // a locked axis cannot flip to vertical mid-gesture
    expect(sample({ x: START_X - 12, y: START_Y + 80, axis: "x" })).toMatchObject({
      axis: "x",
      dx: -12,
    });
  });

  it("clamps the offset without changing the commit threshold", () => {
    expect(sample({ x: START_X - 400 }).dx).toBe(-PAGE_MAX_PX);
    expect(sample({ x: START_X - 400, pointerDown: false, axis: "x" }).step).toBe(1);
  });

  it("lets a vertical gesture scroll the page instead of paging", () => {
    expect(sample({ x: START_X - 5, y: START_Y + 12 })).toMatchObject({ axis: "y", dx: 0, step: 0 });
    expect(sample({ x: START_X - 200, y: START_Y + 12, axis: "y", pointerDown: false })).toEqual({
      axis: "y",
      dx: 0,
      step: 0,
    });
  });

  it("springs back below the commit distance and commits past it", () => {
    expect(sample({ x: START_X - 55, pointerDown: false, axis: "x" }).step).toBe(0);
    expect(sample({ x: START_X - 56, pointerDown: false, axis: "x" }).step).toBe(1);
    expect(sample({ x: START_X + 56, pointerDown: false, axis: "x" }).step).toBe(-1);
  });
});

describe("pageDirection", () => {
  it("recognises next/previous pages from the first tile", () => {
    expect(pageDirection(["2026-11-16"], ["2026-11-23"])).toBe(1);
    expect(pageDirection(["2026-11-23"], ["2026-11-16"])).toBe(-1);
  });

  it("reports no page change for a selection inside the same page", () => {
    expect(pageDirection(["2026-11-16"], ["2026-11-16"])).toBe(0);
    expect(pageDirection([], [])).toBe(0);
  });
});

describe("selectedCellIndex", () => {
  it("finds the selected date and reports -1 when it is off the page", () => {
    const dates = ["2026-11-16", "2026-11-17", "2026-11-18"];
    expect(selectedCellIndex(dates, "2026-11-17")).toBe(1);
    expect(selectedCellIndex(dates, "2026-12-01")).toBe(-1);
  });
});
