import { describe, expect, it } from "vitest";
import {
  activeHeight,
  heightDiffers,
  isTapMovement,
  MODE_SWIPE_PX,
  MODE_SWIPE_RATIO,
  pageDirection,
  pageInFlow,
  PAGE_COMMIT_PX,
  PAGE_LOCK_PX,
  PAGE_MAX_PX,
  resolveModeSwipe,
  resolvePageGesture,
  selectedCellIndex,
  shouldSuppressClick,
  TAP_SLOP_PX,
  validHeight,
  type PageGestureInput,
} from "./calendarMotion";

async function calendarCss(): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL("../motion/calendar.css", import.meta.url), "utf8").split("\r\n").join("\n");
}

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

describe("tap wiring on iOS", () => {
  it("counts a tap that moved a few pixels", () => {
    expect(TAP_SLOP_PX).toBeGreaterThan(PAGE_LOCK_PX);
    expect(isTapMovement(0, 0)).toBe(true);
    expect(isTapMovement(3, -4)).toBe(true);
    expect(isTapMovement(TAP_SLOP_PX, 0)).toBe(true);
    expect(isTapMovement(TAP_SLOP_PX + 1, 0)).toBe(false);
  });

  it("suppresses only a real drag, never a jittery tap or an untracked pointer", () => {
    expect(shouldSuppressClick(null, 80, 10)).toBe(false);
    expect(shouldSuppressClick("x", 4, 0)).toBe(false);
    expect(shouldSuppressClick("x", 40, 0)).toBe(true);
    expect(shouldSuppressClick("y", 0, 40)).toBe(true);
  });
});

describe("mode swipe", () => {
  const swipe = (x: number, y: number, fired = false) =>
    resolveModeSwipe({ startX: 100, startY: 200, x, y, fired });

  it("opens the month downwards and returns to the week upwards", () => {
    expect(swipe(100, 200 + MODE_SWIPE_PX)).toEqual({ mode: "month", fired: true });
    expect(swipe(100, 200 - MODE_SWIPE_PX)).toEqual({ mode: "week", fired: true });
  });

  it("ignores the small movement of an ordinary page scroll", () => {
    expect(swipe(100, 200 + MODE_SWIPE_PX - 1)).toEqual({ mode: null, fired: false });
    expect(swipe(100, 200 + 8)).toEqual({ mode: null, fired: false });
  });

  it("ignores diagonal movement that is mostly horizontal", () => {
    expect(MODE_SWIPE_RATIO).toBeGreaterThan(1);
    expect(swipe(100 + MODE_SWIPE_PX, 200 + MODE_SWIPE_PX)).toEqual({ mode: null, fired: false });
  });

  it("fires once per gesture and again on the next gesture", () => {
    expect(swipe(100, 260, true)).toEqual({ mode: null, fired: true });
    expect(swipe(100, 260, false)).toEqual({ mode: "month", fired: true });
  });
});

describe("measured calendar height", () => {
  it("rejects readings that cannot be trusted and rounds up real ones", () => {
    expect(validHeight(undefined)).toBe(null);
    expect(validHeight(null)).toBe(null);
    expect(validHeight(0)).toBe(null);
    expect(validHeight(-5)).toBe(null);
    expect(validHeight(Number.NaN)).toBe(null);
    expect(validHeight(Number.POSITIVE_INFINITY)).toBe(null);
    expect(validHeight(120.2)).toBe(121);
  });

  it("takes the height only from the active page", () => {
    const heights = { week: 112, month: 340 };
    expect(activeHeight("week", heights)).toBe(112);
    expect(activeHeight("month", heights)).toBe(340);
    // An unmeasured page never makes the calendar fall back to the tall page.
    expect(activeHeight("week", { week: null, month: 340 })).toBe(null);
    expect(activeHeight("month", { week: 112, month: null })).toBe(null);
  });

  it("ignores subpixel observer jitter but notices a real change or a lost reading", () => {
    expect(heightDiffers(112, 112.4)).toBe(false);
    expect(heightDiffers(112, 113)).toBe(true);
    expect(heightDiffers(112, null)).toBe(true);
    expect(heightDiffers(null, null)).toBe(false);
  });

  it("puts exactly one page in flow", () => {
    expect(pageInFlow("week", "week")).toBe(true);
    expect(pageInFlow("week", "month")).toBe(false);
    expect(pageInFlow("month", "month")).toBe(true);
    expect(pageInFlow("month", "week")).toBe(false);
  });
});

describe("calendar stylesheet", () => {
  it("does not use fr rows to collapse the calendar", async () => {
    const styles = await calendarCss();
    const pages = /\.cal-pages\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(pages).not.toMatch(/\b\d+(?:\.\d+)?fr\b/);
    expect(styles).not.toMatch(/\.cal-pages\[data-mode[^\]]*\]\s*\{[^}]*\b\d+(?:\.\d+)?fr\b/);
    expect(pages).toContain("position: relative");
    expect(styles).toContain("transition: height var(--motion-slow)");
  });

  it("takes the inactive page out of flow, hit testing and the accessibility tree", async () => {
    const styles = await calendarCss();
    const active = /\.cal-page\[data-active="true"\]\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";
    const inactive = /\.cal-page\[data-active="false"\]\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(active).toContain("position: relative");
    expect(inactive).toContain("position: absolute");
    expect(inactive).toContain("pointer-events: none");
    expect(inactive).toContain("visibility: hidden");
  });
});
