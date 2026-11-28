/** Pure resolver + hook for the iOS-style "swipe from the left edge to go back"
 *  gesture on menu pages. The resolver is DOM-free so its decisions can be
 *  unit-tested; the hook only translates pointer events into those decisions.
 *
 *  A gesture is considered only when it starts inside EDGE_ZONE_PX of the left
 *  edge. A vertical first movement hands the gesture back to the page scroller
 *  (and never captures the pointer), so scrolling and row swipes are untouched. */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const EDGE_ZONE_PX = 24;
export const EDGE_LOCK_PX = 10;
export const EDGE_COMMIT_RATIO = 1 / 3;
export const FLICK_MIN_DX = 36;
export const FLICK_MIN_SPEED = 0.45; // px per millisecond

export type EdgeAxis = "x" | "y" | null;

export interface EdgeSwipeInput {
  /** Viewport width; the drag is clamped to it. */
  width: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Axis locked by a previous sample; null until the gesture is decided. */
  axis: EdgeAxis;
  pointerDown: boolean;
  /** Milliseconds since the pointer went down (only used for flick detection). */
  elapsedMs: number;
}

export interface EdgeSwipeState {
  axis: EdgeAxis;
  /** Horizontal distance dragged to the right while the finger is down. */
  dx: number;
  /** dx as a fraction of the viewport width. */
  progress: number;
  /** True on release when the page should pop back. */
  commit: boolean;
}

const REST: EdgeSwipeState = { axis: null, dx: 0, progress: 0, commit: false };

/** Resolve one sample of an edge-back gesture. */
export function resolveEdgeSwipe(input: EdgeSwipeInput): EdgeSwipeState {
  const { width, startX, startY, x, y, axis: locked, pointerDown, elapsedMs } = input;
  if (startX > EDGE_ZONE_PX) return REST;

  const rawDx = x - startX;
  const rawDy = y - startY;

  let axis = locked;
  if (!axis && Math.hypot(rawDx, rawDy) >= EDGE_LOCK_PX) {
    axis = Math.abs(rawDx) > Math.abs(rawDy) ? "x" : "y";
  }
  // Vertical scroll wins: never move the page, never commit.
  if (axis !== "x") return { axis, dx: 0, progress: 0, commit: false };

  const dx = Math.max(0, Math.min(width > 0 ? width : 1, rawDx));
  const progress = width > 0 ? dx / width : 0;
  if (pointerDown) return { axis, dx, progress, commit: false };

  const speed = elapsedMs > 0 ? dx / elapsedMs : 0;
  const commit = progress >= EDGE_COMMIT_RATIO || (dx >= FLICK_MIN_DX && speed >= FLICK_MIN_SPEED);
  return { axis, dx: 0, progress: 0, commit };
}

interface Start {
  x: number;
  y: number;
  at: number;
  axis: EdgeAxis;
  width: number;
}

/** Pointer bindings for a page host. `onBack` fires at once on commit — the
 *  caller owns the visual exit (usePresence), so nothing is delayed. */
export function useEdgeBackSwipe({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<Start | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || e.pointerType === "mouse") return;
    if (e.clientX > EDGE_ZONE_PX) return;
    // Never steal a gesture from text fields, dialogs or an existing row swipe.
    // A dialog's scrim is its sibling, so check the document as well.
    if ((e.target as Element).closest("input, textarea, select, [role='dialog'], [data-row-swipe]")) return;
    if (document.querySelector('[role="dialog"]')) return;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      at: performance.now(),
      axis: null,
      width: window.innerWidth,
    };
    setDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s) return;
    const state = resolveEdgeSwipe({
      width: s.width,
      startX: s.x,
      startY: s.y,
      x: e.clientX,
      y: e.clientY,
      axis: s.axis,
      pointerDown: true,
      elapsedMs: performance.now() - s.at,
    });
    if (state.axis === "y") {
      // Let the browser scroll: release capture and stop following the finger.
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      start.current = null;
      setDragging(false);
      setDx(0);
      return;
    }
    s.axis = state.axis;
    if (state.axis === "x") {
      e.preventDefault();
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(state.dx);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    const state = resolveEdgeSwipe({
      width: s.width,
      startX: s.x,
      startY: s.y,
      x: e.clientX,
      y: e.clientY,
      axis: s.axis,
      pointerDown: false,
      elapsedMs: performance.now() - s.at,
    });
    setDx(0); // commit animates on out; otherwise this springs home via the CSS transition
    if (state.commit) onBack();
  }

  function onPointerCancel() {
    start.current = null;
    setDragging(false);
    setDx(0);
  }

  return {
    dx,
    dragging,
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
