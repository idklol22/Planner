/** Pure helpers behind the calendar's paging gesture and its moving selection.
 *  No DOM here, so the rules can be tested without a renderer. */

import type { ISODate } from "../domain/dates";

export type CalendarMode = "week" | "month";

export type SwipeAxis = "x" | "y" | null;
/** -1 = previous page, 1 = next page, 0 = stay on this page. */
export type PageStep = -1 | 0 | 1;

export const PAGE_LOCK_PX = 8;
export const PAGE_COMMIT_PX = 56;
export const PAGE_MAX_PX = 160;
/** A sloppy tap (a few pixels of finger travel) still counts as a tap. */
export const TAP_SLOP_PX = 12;
/** A deliberate mode swipe: well past a page-scroll twitch, mostly vertical. */
export const MODE_SWIPE_PX = 80;
export const MODE_SWIPE_RATIO = 1.5;

export interface PageGestureInput {
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Axis locked by an earlier sample; null until the gesture starts. */
  axis: SwipeAxis;
  /** True while the finger is down, false on release. */
  pointerDown: boolean;
}

export interface PageGestureState {
  axis: SwipeAxis;
  /** 1:1 display offset, clamped to ±PAGE_MAX_PX. Zero for a vertical gesture. */
  dx: number;
  /** Non-zero only on release, once the gesture has crossed PAGE_COMMIT_PX. */
  step: PageStep;
}

const REST: PageGestureState = { axis: null, dx: 0, step: 0 };
const clamp = (n: number) => Math.max(-PAGE_MAX_PX, Math.min(PAGE_MAX_PX, n));

/**
 * Resolve one paging sample. The axis is sticky: a vertical lock always returns
 * dx 0 so the page keeps scrolling, and a horizontal lock cannot flip to y.
 * Mouse pointers are ignored; chevrons provide the desktop path.
 */
export function resolvePageGesture(input: PageGestureInput): PageGestureState {
  const { pointerType, startX, startY, x, y, pointerDown } = input;
  if (pointerType === "mouse" || (!pointerDown && !input.axis)) return REST;

  const rawDx = x - startX;
  const rawDy = y - startY;
  let axis = input.axis;
  if (!axis && Math.hypot(rawDx, rawDy) >= PAGE_LOCK_PX) {
    axis = Math.abs(rawDx) > Math.abs(rawDy) ? "x" : "y";
  }
  if (axis !== "x") return axis ? { axis, dx: 0, step: 0 } : REST;

  const dx = clamp(rawDx);
  if (pointerDown) return { axis, dx, step: 0 };
  const step: PageStep = rawDx <= -PAGE_COMMIT_PX ? 1 : rawDx >= PAGE_COMMIT_PX ? -1 : 0;
  return { axis, dx, step };
}

/** ISO dates compare lexicographically, so the first tile names the page.
 *  Within one page (a tap on another day) the first tile is unchanged. */
export function pageDirection(prev: readonly ISODate[], next: readonly ISODate[]): PageStep {
  if (!prev.length || !next.length) return 0;
  if (next[0] > prev[0]) return 1;
  if (next[0] < prev[0]) return -1;
  return 0;
}

export function selectedCellIndex(dates: readonly ISODate[], selected: ISODate): number {
  return dates.indexOf(selected);
}

/** A tap is a tap even when the finger drifted a few pixels on iOS. */
export function isTapMovement(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP_PX;
}

/** Only a real drag may swallow the click that follows it. A jittery tap, a
 *  vertical page scroll and a keyboard activation must all keep their click. */
export function shouldSuppressClick(axis: SwipeAxis, dx: number, dy: number): boolean {
  return axis !== null && !isTapMovement(dx, dy);
}

export interface ModeSwipeInput {
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once this gesture has already toggled the mode. */
  fired: boolean;
  /** True when the page actually scrolled during this touch: it is a scroll, not a swipe. */
  scrolled?: boolean;
}

export interface ModeSwipeResult {
  mode: CalendarMode | null;
  fired: boolean;
}

/** Down opens the month, up returns to the week. Small or diagonal movement is
 *  an ordinary scroll/tap and does nothing; the latch makes it once per gesture. */
export function resolveModeSwipe(input: ModeSwipeInput): ModeSwipeResult {
  const dx = input.x - input.startX;
  const dy = input.y - input.startY;
  if (
    input.fired ||
    input.scrolled ||
    Math.abs(dy) < MODE_SWIPE_PX ||
    Math.abs(dy) < Math.abs(dx) * MODE_SWIPE_RATIO
  ) {
    return { mode: null, fired: input.fired };
  }
  return { mode: dy > 0 ? "month" : "week", fired: true };
}

export interface CalendarHeights {
  week: number | null;
  month: number | null;
}

/** An unmeasurable page must not get an inline height: the flow/stack layout is
 *  already correct before measurement, so no failed read can leave it open. */
export function validHeight(px: number | null | undefined): number | null {
  if (typeof px !== "number" || !Number.isFinite(px) || px <= 0) return null;
  return Math.ceil(px);
}

/** Only the active page's measured height drives the container. */
export function activeHeight(mode: CalendarMode, heights: CalendarHeights): number | null {
  return validHeight(mode === "week" ? heights.week : heights.month);
}

/** ResizeObserver jitter below a pixel must not restart the height transition. */
export function heightDiffers(a: number | null, b: number | null): boolean {
  if (a === b) return false;
  if (a === null || b === null) return true;
  return Math.abs(a - b) >= 1;
}

/** Exactly one page is in normal flow; the other is stacked out of the layout. */
export function pageInFlow(mode: CalendarMode, page: CalendarMode): boolean {
  return mode === page;
}
