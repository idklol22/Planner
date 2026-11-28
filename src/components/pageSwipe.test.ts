import { describe, expect, it } from "vitest";
import { EDGE_COMMIT_RATIO, resolveEdgeSwipe } from "./pageSwipe";

const WIDTH = 390;
const sample = (over: Partial<Parameters<typeof resolveEdgeSwipe>[0]>) => ({
  width: WIDTH,
  startX: 8,
  startY: 100,
  x: 8,
  y: 100,
  axis: null as null | "x" | "y",
  pointerDown: true,
  elapsedMs: 100,
  ...over,
});

describe("resolveEdgeSwipe", () => {
  it("ignores gestures that do not start at the left edge", () => {
    const state = resolveEdgeSwipe(sample({ startX: 80, x: 300 }));
    expect(state).toEqual({ axis: null, dx: 0, progress: 0, commit: false });
  });

  it("hands vertical movement back to the scroller", () => {
    const state = resolveEdgeSwipe(sample({ x: 10, y: 180 }));
    expect(state.axis).toBe("y");
    expect(state.dx).toBe(0);
  });

  it("follows the finger 1:1 and clamps to the width", () => {
    const drag = resolveEdgeSwipe(sample({ x: 120 }));
    expect(drag.axis).toBe("x");
    expect(drag.dx).toBe(112);
    expect(drag.progress).toBeCloseTo(112 / WIDTH);
    expect(resolveEdgeSwipe(sample({ x: 900 })).dx).toBe(WIDTH);
  });

  it("commits past a third of the width", () => {
    const short = resolveEdgeSwipe(sample({ x: 8 + WIDTH * 0.2, pointerDown: false, elapsedMs: 800 }));
    expect(short.commit).toBe(false);
    const long = resolveEdgeSwipe(sample({ x: 8 + WIDTH * (EDGE_COMMIT_RATIO + 0.05), pointerDown: false, elapsedMs: 800 }));
    expect(long.commit).toBe(true);
  });

  it("commits a quick flick even when short", () => {
    const flick = resolveEdgeSwipe(sample({ x: 60, pointerDown: false, elapsedMs: 60 }));
    expect(flick.commit).toBe(true);
    const slow = resolveEdgeSwipe(sample({ x: 60, pointerDown: false, elapsedMs: 900 }));
    expect(slow.commit).toBe(false);
  });

  it("springs home when a held axis lock is released below the threshold", () => {
    const state = resolveEdgeSwipe(sample({ axis: "x", x: 8 + 40, y: 100, pointerDown: false, elapsedMs: 900 }));
    expect(state.commit).toBe(false);
    expect(state.dx).toBe(0);
  });
});
