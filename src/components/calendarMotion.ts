/** Pure helpers behind the calendar's paging gesture and its moving selection.
 *  No DOM here, so the rules can be tested without a renderer. */

import type { ISODate } from "../domain/dates";

export type SwipeAxis = "x" | "y" | null;
/** -1 = previous page, 1 = next page, 0 = stay on this page. */
export type PageStep = -1 | 0 | 1;

export const PAGE_LOCK_PX = 8;
export const PAGE_COMMIT_PX = 56;
export const PAGE_MAX_PX = 160;

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
