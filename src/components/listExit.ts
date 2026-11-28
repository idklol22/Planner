/** Keeps removed rows mounted for one short exit so they can collapse away.
 *  The live state changes immediately; this only holds a visual copy of a row
 *  that has already gone from the store (never a second save/delete). */

import { useEffect, useRef, useState } from "react";
import { MOTION_MS, prefersReducedMotion } from "../lib/motion";

export interface ExitingEntry<T> {
  item: T;
  /** The next surviving row when it disappeared, so it collapses in place. */
  afterId: string | null;
}

export interface RenderedEntry<T> {
  item: T;
  exiting: boolean;
}

/** Pure merge of live items and still-collapsing ones, preserving row order. */
export function mergeExiting<T extends { id: string }>(items: T[], exiting: ExitingEntry<T>[]): RenderedEntry<T>[] {
  const merged: RenderedEntry<T>[] = items.map((item) => ({ item, exiting: false }));
  for (const entry of exiting) {
    if (items.some((item) => item.id === entry.item.id)) continue;
    const at = entry.afterId ? merged.findIndex((row) => row.item.id === entry.afterId) : -1;
    merged.splice(at < 0 ? merged.length : at, 0, { item: entry.item, exiting: true });
  }
  return merged;
}

/** Track a keyed list and expose rows plus the ones that are animating out.
 *  Depend on the id list, not the array identity, so derived lists are safe. */
export function useListExit<T extends { id: string }>(items: T[], exitMs = MOTION_MS.base): RenderedEntry<T>[] {
  const key = items.map((item) => item.id).join("\u0000");
  const latest = useRef(items);
  latest.current = items;
  const previous = useRef(items);
  const [exiting, setExiting] = useState<ExitingEntry<T>[]>([]);

  useEffect(() => {
    const before = previous.current;
    previous.current = latest.current;
    const gone = before
      .map((item, index) => {
        const after = before.slice(index + 1).find((next) => latest.current.some((current) => current.id === next.id));
        return { item, afterId: after?.id ?? null };
      })
      .filter(({ item }) => !latest.current.some((current) => current.id === item.id));
    if (gone.length === 0) return;

    setExiting((current) => [
      ...current.filter((entry) => !gone.some((g) => g.item.id === entry.item.id)),
      ...gone,
    ]);
    window.setTimeout(() => {
      setExiting((current) => current.filter((entry) => !gone.some((g) => g.item.id === entry.item.id)));
    }, prefersReducedMotion() ? 0 : exitMs);
  }, [key, exitMs]);

  return mergeExiting(latest.current, exiting);
}
