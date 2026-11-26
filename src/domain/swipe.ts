/** Pure touch/pen swipe resolver. No DOM: callers feed pointer coordinates in
 *  and render the resulting offset/action. Mouse pointers are ignored so the
 *  row's "..." menu and normal desktop interaction are untouched. */

export const SWIPE_LOCK_PX = 10;
export const SWIPE_COMMIT_PX = 96;
export const SWIPE_MAX_PX = 120;

export type SwipeAxis = "x" | "y" | null;
export type SwipeAction = "delete" | "archive" | null;

export interface SwipeInput {
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Axis locked by a previous call; pass null until the gesture starts. */
  axis: SwipeAxis;
  /** True while the pointer is down, false on release. */
  pointerDown: boolean;
}

export interface SwipeState {
  axis: SwipeAxis;
  /** Display offset, clamped to ±SWIPE_MAX_PX. Zero for y / no gesture / spring-back. */
  dx: number;
  action: SwipeAction;
  /** True once the gesture has ended without a committed action (spring back). */
  settled: boolean;
}

const clampDx = (dx: number) => Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, dx));

/**
 * Resolve one swipe sample. `axis` is sticky across calls so a gesture cannot
 * flip from horizontal to vertical mid-drag: a vertical lock zeroes the offset
 * (let the page scroll), a horizontal lock commits past ±SWIPE_COMMIT_PX on
 * release and otherwise springs back with dx = 0.
 */
export function resolveSwipe(input: SwipeInput): SwipeState {
  const { pointerType, startX, startY, x, y, pointerDown } = input;
  if (pointerType === "mouse" || (!pointerDown && !input.axis)) {
    return { axis: null, dx: 0, action: null, settled: false };
  }

  const rawDx = x - startX;
  const rawDy = y - startY;
  let axis = input.axis;
  if (!axis && Math.hypot(rawDx, rawDy) >= SWIPE_LOCK_PX) {
    axis = Math.abs(rawDx) > Math.abs(rawDy) ? "x" : "y";
  }

  // Vertical scroll wins: never move the row, never commit an action.
  if (axis === "y") {
    return { axis, dx: 0, action: null, settled: !pointerDown };
  }
  if (!axis) {
    return { axis: null, dx: 0, action: null, settled: !pointerDown };
  }

  const dx = clampDx(rawDx);
  if (pointerDown) return { axis, dx, action: null, settled: false };

  if (rawDx <= -SWIPE_COMMIT_PX) return { axis, dx, action: "delete", settled: false };
  if (rawDx >= SWIPE_COMMIT_PX) return { axis, dx, action: "archive", settled: false };
  return { axis, dx: 0, action: null, settled: true };
}
