import { describe, expect, it } from "vitest";
import {
  resolveSwipe,
  SWIPE_COMMIT_PX,
  SWIPE_LOCK_PX,
  SWIPE_MAX_PX,
  type SwipeInput,
} from "./swipe";

const START_X = 200;
const START_Y = 100;

function move(
  x: number,
  y = START_Y,
  over: Partial<SwipeInput> = {},
): ReturnType<typeof resolveSwipe> {
  return resolveSwipe({
    pointerType: "touch",
    startX: START_X,
    startY: START_Y,
    x,
    y,
    axis: null,
    pointerDown: true,
    ...over,
  });
}

function release(
  x: number,
  y = START_Y,
  over: Partial<SwipeInput> = {},
): ReturnType<typeof resolveSwipe> {
  return resolveSwipe({
    pointerType: "touch",
    startX: START_X,
    startY: START_Y,
    x,
    y,
    axis: "x",
    pointerDown: false,
    ...over,
  });
}

describe("resolveSwipe", () => {
  it("exports the documented thresholds", () => {
    expect(SWIPE_LOCK_PX).toBe(10);
    expect(SWIPE_COMMIT_PX).toBe(96);
    expect(SWIPE_MAX_PX).toBe(120);
  });

  it("ignores mouse pointers entirely", () => {
    expect(
      resolveSwipe({
        pointerType: "mouse",
        startX: START_X,
        startY: START_Y,
        x: START_X - 200,
        y: START_Y,
        axis: null,
        pointerDown: true,
      }),
    ).toEqual({ axis: null, dx: 0, action: null, settled: false });
  });

  it("has no displacement before pointerdown", () => {
    expect(
      resolveSwipe({
        pointerType: "pen",
        startX: START_X,
        startY: START_Y,
        x: START_X - 100,
        y: START_Y,
        axis: null,
        pointerDown: false,
      }),
    ).toEqual({ axis: null, dx: 0, action: null, settled: false });
  });

  it("does not lock the axis below 10px of total travel", () => {
    expect(move(START_X - 9, START_Y + 3)).toEqual({
      axis: null,
      dx: 0,
      action: null,
      settled: false,
    });
  });

  it("locks the axis at 10px: horizontal wins on |dx| > |dy|", () => {
    const out = move(START_X - 12, START_Y + 5);
    expect(out).toMatchObject({ axis: "x", dx: -12, action: null, settled: false });
    // once locked, a later vertical move cannot change the axis
    expect(move(START_X - 12, START_Y + 80, { axis: "x" }).axis).toBe("x");
  });

  it("locks to y and zeroes dx so vertical scroll wins", () => {
    const out = move(START_X - 5, START_Y + 12);
    expect(out).toMatchObject({ axis: "y", dx: 0, action: null });
    expect(move(START_X - 80, START_Y + 12, { axis: "y" })).toEqual({
      axis: "y",
      dx: 0,
      action: null,
      settled: false,
    });
    // a y-locked gesture cannot commit on release
    expect(release(START_X - 200, START_Y + 12, { axis: "y" })).toMatchObject({
      axis: "y",
      dx: 0,
      action: null,
    });
  });

  it("springs back from 95px (no commit)", () => {
    expect(release(START_X - 95)).toEqual({
      axis: "x",
      dx: 0,
      action: null,
      settled: true,
    });
    expect(release(START_X + 95)).toEqual({
      axis: "x",
      dx: 0,
      action: null,
      settled: true,
    });
  });

  it("commits delete at 96px left and archive at 96px right", () => {
    expect(release(START_X - SWIPE_COMMIT_PX)).toMatchObject({
      axis: "x",
      action: "delete",
      settled: false,
    });
    expect(release(START_X + SWIPE_COMMIT_PX)).toMatchObject({
      axis: "x",
      action: "archive",
      settled: false,
    });
  });

  it("clamps the display displacement to ±120px while dragging", () => {
    expect(move(START_X - 200).dx).toBe(-SWIPE_MAX_PX);
    expect(move(START_X + 200).dx).toBe(SWIPE_MAX_PX);
    // the clamped display value is not the commit threshold: both still commit
    expect(release(START_X - 200)).toMatchObject({ dx: -SWIPE_MAX_PX, action: "delete" });
    expect(release(START_X + 200)).toMatchObject({ dx: SWIPE_MAX_PX, action: "archive" });
  });
});
