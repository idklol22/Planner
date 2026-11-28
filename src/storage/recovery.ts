/** Safety net for stored planner data.
 *
 *  Loading is never allowed to turn a partly damaged store into an empty one:
 *  valid records are used as usual, rejected records are copied verbatim under
 *  their own keys, and the untouched original is kept under BACKUP_KEY before
 *  any save can replace it. An existing backup is only replaced by strictly
 *  better data (a salvageable original beats an unreadable one), so the
 *  earliest good copy survives.
 */

import { inspectAppData, type AppData, type DroppedRecord } from "../domain/model";
import type { LoadIssue, LoadResult } from "./port";

export const BACKUP_KEY = "todomate.data.backup.v1";
export const QUARANTINE_PREFIX = "todomate.quarantine.";

export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type BackupQuality = "unreadable" | "partial";

/** The original text is stored verbatim inside the envelope, not re-serialised. */
export interface BackupEnvelope {
  version: 1;
  raw: string;
  quality: BackupQuality;
  at: string;
}

const RANK: Record<BackupQuality, number> = { unreadable: 0, partial: 1 };

export function readBackup(raw: string | null): BackupEnvelope | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<BackupEnvelope>;
    if (value.version !== 1 || typeof value.raw !== "string") return null;
    return {
      version: 1,
      raw: value.raw,
      quality: value.quality === "partial" ? "partial" : "unreadable",
      at: typeof value.at === "string" ? value.at : "",
    };
  } catch {
    return null;
  }
}

function backupRank(raw: string | null): number {
  if (!raw) return -1;
  return RANK[readBackup(raw)?.quality ?? "unreadable"];
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "unknown";
}

/** One key per rejected record (kind + id + index), so records never collide. */
export function quarantineKey(record: DroppedRecord): string {
  const position = record.index < 0 ? "field" : String(record.index);
  return `${QUARANTINE_PREFIX}${safeSegment(record.kind)}.${safeSegment(record.id ?? "anonymous")}.${position}`;
}

export interface RecoveryPlan {
  /** Data the app may use; null only on a genuinely empty store. */
  data: AppData | null;
  /** Write this envelope only when it improves on the stored backup. */
  backup: BackupEnvelope | null;
  /** Untouched rejected records, each with its own storage key. */
  quarantine: Array<{ key: string; value: string }>;
  issue: LoadIssue | null;
}

/** Pure part of recovery: decide what to keep, back up and quarantine. */
export function planRecovery(raw: string | null, existingBackup: string | null, at = new Date().toISOString()): RecoveryPlan {
  if (raw === null) {
    return { data: null, backup: null, quarantine: [], issue: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const issue: LoadIssue = {
      reason: "unreadable",
      dropped: 0,
      repairedSettings: [],
      quarantinedKeys: [],
    };
    return {
      data: null,
      backup:
        existingBackup === null || backupRank(existingBackup) < RANK.unreadable
          ? { version: 1, raw, quality: "unreadable", at }
          : null,
      quarantine: [],
      issue,
    };
  }
  const inspection = inspectAppData(parsed);
  const quarantine = inspection.dropped.map((record) => ({
    key: quarantineKey(record),
    value: record.raw,
  }));
  const usable = !inspection.unrecognized;
  const partial = inspection.dropped.length > 0 || inspection.repairedSettings.length > 0;
  const reason: LoadIssue["reason"] | null = !usable
    ? "unreadable"
    : partial
      ? "partial"
      : null;
  const issue: LoadIssue | null = reason
    ? {
        reason,
        dropped: inspection.dropped.length,
        repairedSettings: inspection.repairedSettings,
        quarantinedKeys: quarantine.map((entry) => entry.key),
      }
    : null;
  const quality: BackupQuality = reason === "unreadable" ? "unreadable" : "partial";
  const candidate: BackupEnvelope | null =
    issue && (existingBackup === null || RANK[quality] > backupRank(existingBackup))
      ? { version: 1, raw, quality, at }
      : null;
  return {
    data: inspection.data,
    backup: candidate,
    quarantine: usable ? quarantine : [],
    issue,
  };
}

/** Apply a plan to storage. Backup first: no save may beat it. */
export function recoverStored(raw: string | null, storage: RecoveryStorage): LoadResult {
  const plan = planRecovery(raw, storage.getItem(BACKUP_KEY));
  const write = (key: string, value: string) => {
    try {
      // Never replace an existing copy with the same or worse data.
      if (storage.getItem(key) === null) storage.setItem(key, value);
    } catch {
      // Storage may be full or blocked; loading still continues with the salvage.
    }
  };
  if (plan.backup) {
    try {
      if (backupRank(storage.getItem(BACKUP_KEY)) < RANK[plan.backup.quality]) {
        storage.setItem(BACKUP_KEY, JSON.stringify(plan.backup));
      }
    } catch {
      // ignored: the current session can still use the salvaged records
    }
  }
  for (const entry of plan.quarantine) write(entry.key, entry.value);
  return { data: plan.data, issue: plan.issue };
}
