/** Small, interruptible number/collapse helpers for the calorie meters.
 *  Pure functions stay separate from the hooks so they can be tested directly. */

import { useEffect, useRef, useState } from "react";
import { MOTION_MS, prefersReducedMotion } from "../lib/motion";

export const COUNT_MS = MOTION_MS.base;

/** Matches the --ease-out token (a cubic out). */
export function easeOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** Value of an interrupted count at progress t (0..1). */
export function countAt(from: number, to: number, t: number): number {
  return from + (to - from) * easeOut(t);
}

export function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Count from the last shown value to `value`. A new value restarts from wherever
 * the previous count got to, so several quick edits never queue or jump.
 * Unrelated re-renders do nothing: the effect only watches `value`.
 */
export function useCount(value: number, precision = 0): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (prefersReducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_MS);
      const next = t === 1 ? value : roundTo(countAt(from, value, t), precision);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, precision]);

  return shown;
}

export interface EntryRow<T> {
  item: T;
  leaving: boolean;
}

/**
 * Keep removed rows around for one exit, and cancel that exit if the same id
 * comes back before the timer fires. Existing rows keep their position.
 */
export function mergeEntryRows<T extends { id: string }>(prev: EntryRow<T>[], next: T[]): EntryRow<T>[] {
  const byId = new Map(next.map((item) => [item.id, item]));
  const rows: EntryRow<T>[] = [];
  const seen = new Set<string>();
  for (const row of prev) {
    const item = byId.get(row.item.id);
    if (item) {
      rows.push({ item, leaving: false });
      seen.add(item.id);
    } else {
      rows.push({ item: row.item, leaving: true });
    }
  }
  for (const item of next) {
    if (!seen.has(item.id)) rows.push({ item, leaving: false });
  }
  return rows;
}

/** `signature` is the caller's stable id/value string: it keeps a freshly
 *  filtered `items` array from retriggering the effect on every render. */
export function useEntryRows<T extends { id: string }>(items: T[], signature: string): EntryRow<T>[] {
  const [rows, setRows] = useState<EntryRow<T>[]>(() => items.map((item) => ({ item, leaving: false })));

  useEffect(() => {
    setRows((prev) => mergeEntryRows(prev, items));
    const timer = window.setTimeout(
      () => setRows(items.map((item) => ({ item, leaving: false }))),
      prefersReducedMotion() ? 0 : MOTION_MS.base,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return rows;
}
