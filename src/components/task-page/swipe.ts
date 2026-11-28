/** Pure geometry for the left-edge "go back" gesture on the note screen.
 *  The handlers in TaskPage only turn pointer positions into these numbers. */

/** How far from the left edge a swipe may begin. */
export const SWIPE_EDGE = 24;
/** Fraction of the screen that commits the navigation when released. */
export const SWIPE_COMMIT = 0.35;
/** A swipe must be at least this much horizontal before it is horizontal. */
export const SWIPE_SLOPE = 1.2;
/** A quick flick commits even if it covered less than SWIPE_COMMIT. */
export const SWIPE_FLING_PX_PER_MS = 0.5;

export function canStartSwipeBack(
  startX: number,
  viewportWidth: number,
  options: { selecting: boolean; insideEditor: boolean },
): boolean {
  if (options.selecting || options.insideEditor) return false;
  return viewportWidth > 0 && startX >= 0 && startX <= SWIPE_EDGE;
}

/** 0..1 travel toward the right edge; vertical drags are never a swipe. */
export function swipeBackProgress(dx: number, dy: number, viewportWidth: number): number {
  if (dx <= 0 || viewportWidth <= 0) return 0;
  if (Math.abs(dy) > Math.abs(dx) / SWIPE_SLOPE) return 0;
  return Math.min(1, dx / viewportWidth);
}

/** Release decision: far enough, or a clear flick to the right. */
export function shouldCommitSwipe(
  dx: number,
  dy: number,
  viewportWidth: number,
  velocityX = 0,
): boolean {
  if (swipeBackProgress(dx, dy, viewportWidth) === 0) return false;
  return (
    swipeBackProgress(dx, dy, viewportWidth) >= SWIPE_COMMIT ||
    (dx > 12 && velocityX >= SWIPE_FLING_PX_PER_MS)
  );
}
