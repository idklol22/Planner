/** Small React helpers for the day list. All exits go through `usePresence`
 *  from src/lib/motion.ts, and every JavaScript timing uses the same tokens. */
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import { mergeMotionRows, type MotionRowData } from "../domain/daySections";
import { MOTION_MS, prefersReducedMotion, usePresence } from "../lib/motion";

/** Ids that were not present in the previous layout. The first render has none,
 *  so existing rows never animate just because the screen mounted or re-rendered. */
export function useEnteringIds(ids: readonly string[]): ReadonlySet<string> {
  const state = useRef<{ signature: string; ids: Set<string>; entering: Set<string> }>({
    signature: "\u0000initial",
    ids: new Set(),
    entering: new Set(),
  });
  const signature = ids.join("\u0000");
  if (signature !== state.current.signature) {
    const fresh = ids.filter((id) => !state.current.ids.has(id));
    state.current = { signature, ids: new Set(ids), entering: new Set(fresh) };
  }
  return state.current.entering;
}

export interface MotionRows<T> {
  rows: MotionRowData<T>[];
  exitMs: number;
  /** Called by a row once its exit has finished; the stale copy can then go. */
  drop: (id: string) => void;
}

/**
 * Keeps removed rows mounted long enough to animate out. Removal is detected
 * during render (not in an effect) so a row is never torn down for a frame
 * before its exit starts. The data action itself happens in the caller.
 */
export function useMotionRows<T extends { id: string }>(
  items: readonly T[],
  exitMs = MOTION_MS.base,
): MotionRows<T> {
  const stale = useRef<T[]>([]);
  const dropped = useRef<Set<string>>(new Set());
  const previous = useRef<T[]>([...items]);
  const layout = useRef<string[]>([]);
  const entering = useEnteringIds(items.map((item) => item.id));
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  if (previous.current !== items) {
    const live = new Set(items.map((item) => item.id));
    const removed = previous.current.filter((item) => !live.has(item.id));
    previous.current = [...items];
    if (removed.length) {
      stale.current = [
        ...stale.current.filter(
          (item) => !live.has(item.id) && !dropped.current.has(item.id),
        ),
        ...removed.filter((item) => !stale.current.some((old) => old.id === item.id)),
      ];
    }
  }
  if (dropped.current.size) {
    stale.current = stale.current.filter((item) => !dropped.current.has(item.id));
    dropped.current = new Set();
  }

  const rows = mergeMotionRows(items, stale.current, layout.current, entering);
  useLayoutEffect(() => {
    layout.current = rows.map((row) => row.item.id);
  });

  const drop = useCallback((id: string) => {
    dropped.current.add(id);
    rerender();
  }, []);

  return { rows, exitMs, drop };
}

export interface MotionRowProps {
  present: boolean;
  entering?: boolean;
  exitMs?: number;
  onExited?: () => void;
  innerRef?: (node: HTMLElement | null) => void;
  className?: string;
  /** Use `li` for slots directly inside a list. */
  as?: "div" | "li";
  children: ReactNode;
}

/** One animated list slot. Enter/leave are CSS (transform + opacity + a
 *  0fr/1fr height collapse); presence owns how long the leaving row stays. */
export function MotionRow({
  present,
  entering = false,
  exitMs = MOTION_MS.base,
  onExited,
  innerRef,
  className,
  as = "div",
  children,
}: MotionRowProps) {
  const presence = usePresence(present, exitMs);
  useEffect(() => {
    if (!presence.mounted && !presence.closing) onExited?.();
  }, [presence.mounted, presence.closing, onExited]);

  if (!presence.mounted) return null;
  const phase = !present && presence.closing ? "leave" : entering ? "enter" : "";
  const Tag = as;
  return (
    <Tag className={`day-slot ${phase} ${className ?? ""}`.trim()} aria-hidden={present ? undefined : true}>
      <div ref={innerRef} className="day-slot-inner">
        {children}
      </div>
    </Tag>
  );
}

/**
 * First/Last/Invert/Play for rows that change position (a task is ticked and
 * the list reorders, a goal moves up or down). A short transform on the row
 * only; no will-change is left behind. Skipped entirely for reduced motion.
 */
export function useFlipRows(ids: readonly string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, number>());
  const signature = ids.join("\u0000");

  useLayoutEffect(() => {
    const after = new Map<string, number>();
    nodes.current.forEach((node, id) => {
      if (node.isConnected) after.set(id, node.offsetTop);
    });
    if (!prefersReducedMotion()) {
      after.forEach((top, id) => {
        const previousTop = before.current.get(id);
        if (previousTop === undefined || Math.abs(previousTop - top) < 1) return;
        const node = nodes.current.get(id);
        node?.animate?.(
          [{ transform: `translateY(${previousTop - top}px)` }, { transform: "translateY(0)" }],
          { duration: MOTION_MS.base, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      });
    }
    before.current = after;
  }, [signature]);

  return useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );
}
