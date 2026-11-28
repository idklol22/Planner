import { describe, expect, it } from "vitest";
import {
  canStartSwipeBack,
  shouldCommitSwipe,
  swipeBackProgress,
  SWIPE_EDGE,
} from "./swipe";

const free = { selecting: false, insideEditor: false };

describe("canStartSwipeBack", () => {
  it("only starts inside the left edge strip", () => {
    expect(canStartSwipeBack(0, 390, free)).toBe(true);
    expect(canStartSwipeBack(SWIPE_EDGE, 390, free)).toBe(true);
    expect(canStartSwipeBack(SWIPE_EDGE + 1, 390, free)).toBe(false);
    expect(canStartSwipeBack(-1, 390, free)).toBe(false);
    expect(canStartSwipeBack(4, 0, free)).toBe(false);
  });

  it("never hijacks text selection or the editor", () => {
    expect(canStartSwipeBack(8, 390, { ...free, selecting: true })).toBe(false);
    expect(canStartSwipeBack(8, 390, { ...free, insideEditor: true })).toBe(false);
  });
});

describe("swipeBackProgress", () => {
  it("follows horizontal travel one to one and clamps at the edge", () => {
    expect(swipeBackProgress(0, 0, 400)).toBe(0);
    expect(swipeBackProgress(100, 0, 400)).toBeCloseTo(0.25);
    expect(swipeBackProgress(600, 0, 400)).toBe(1);
  });

  it("ignores back and vertical drags", () => {
    expect(swipeBackProgress(-40, 0, 400)).toBe(0);
    expect(swipeBackProgress(80, 100, 400)).toBe(0);
    expect(swipeBackProgress(80, 20, 400)).toBeCloseTo(0.2);
  });
});

describe("shouldCommitSwipe", () => {
  it("commits after a third of the screen", () => {
    expect(shouldCommitSwipe(139, 0, 400)).toBe(false);
    expect(shouldCommitSwipe(140, 0, 400)).toBe(true);
  });

  it("also commits a quick flick and rejects vertical motion", () => {
    expect(shouldCommitSwipe(40, 0, 400, 0.8)).toBe(true);
    expect(shouldCommitSwipe(40, 0, 400, 0.1)).toBe(false);
    expect(shouldCommitSwipe(200, 180, 400, 0.9)).toBe(false);
  });
});
