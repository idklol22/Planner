/** Pulled `health` rows live outside AppData: they are per-day records in the
 *  same localStorage store HealthProvider reads (`lib/health.ts`). This module
 *  applies them with the existing health record format and merge rules, then
 *  announces the change so the provider can re-read the store. */

import {
  HEALTH_KEY,
  isISODate,
  mergeHealthDay,
  parseHealthData,
  sanitizeHealthDay,
  serializeHealthData,
  toHealthRow,
} from "../lib/health";
import type { HealthRow } from "../storage/hub";
import { isNewerRow } from "./queue";

/** HealthProvider listens for this to re-read the day map after a remote write. */
export const HEALTH_REMOTE_EVENT = "planner.health.remote";

export interface HealthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function dateFromId(id: string): string | null {
  if (id.startsWith("health_")) return id.slice("health_".length);
  return isISODate(id) ? id : null;
}

/** The local row for the engine's last-write-wins check, or null if no day is stored. */
export function getLocalHealthRow(storage: HealthStorage, id: string): HealthRow | null {
  const date = dateFromId(id);
  if (!date || !isISODate(date)) return null;
  const record = parseHealthData(storage.getItem(HEALTH_KEY))[date];
  return record ? toHealthRow(record) : null;
}

function announce(date: string): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent(HEALTH_REMOTE_EVENT, { detail: { date } }));
}

/** Merge one pulled health row into the local day map. A missing metric never
 *  erases a stored one; a newer stamp wins; an explicit tombstone deletes. */
export function applyRemoteHealthRow(storage: HealthStorage, row: HealthRow): boolean {
  if (!row || !isISODate(row.date)) return false;
  const date = row.date;
  const days = parseHealthData(storage.getItem(HEALTH_KEY));
  const current = days[date];
  if (current && !isNewerRow(row, toHealthRow(current))) return false;

  if (row.deletedAt) {
    if (!current) return false;
    delete days[date];
    try {
      storage.setItem(HEALTH_KEY, serializeHealthData(days));
    } catch {
      return false;
    }
    announce(date);
    return true;
  }

  const incoming = sanitizeHealthDay(row);
  if (!incoming) return false;
  const { record } = mergeHealthDay(current, incoming, row.source, row.updatedAt);
  // mergeHealthDay keeps stored values for absent metrics; adopt the row's own
  // stamp even when no number changed so every device agrees on what is newest.
  days[date] = {
    ...record,
    source: row.source === "healthkit" ? "healthkit" : "shortcut",
    updatedAt: row.updatedAt,
  };
  try {
    storage.setItem(HEALTH_KEY, serializeHealthData(days));
  } catch {
    return false;
  }
  announce(date);
  return true;
}
