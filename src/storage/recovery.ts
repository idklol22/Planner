/** Safety net for stored planner data.
 *
 *  Loading is never allowed to turn a partly damaged store into an empty one:
 *  valid records are used as usual, rejected records are copied verbatim under
 *  their own keys, and the untouched original is kept under BACKUP_KEY before
 *  any save can replace it. An existing backup is only replaced by strictly
 *  better data (a salvageable original beats an unreadable one), so the
 *  earliest good copy survives.
 *
 *  A copy is only a copy once it has been read back. If any copy needed for a
 *  load cannot be written (a full or blocked store), the pending copies are
 *  remembered here and every save must first write and verify them. Until
 *  then the data key must stay untouched, or the damaged original is lost.
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

/** One verbatim value that must exist in storage before a save may proceed. */
export interface SafetyCopy {
  key: string;
  value: string;
}

const RANK: Record<BackupQuality, number> = { unreadable: 0, partial: 1 };
/** One gate per storage instance (localStorage in both web and native builds). */
const pendingByStorage = new WeakMap<object, SafetyCopy[]>();
const NO_PENDING: readonly SafetyCopy[] = [];

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

/** Short stable digest so two different damaged versions of the same record
 *  never overwrite each other in quarantine. */
function rawDigest(raw: string): string {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** One key per rejected value (kind + id + index + content), so neither
 *  different records nor later damaged versions of one record collide. */
export function quarantineKey(record: DroppedRecord): string {
  const position = record.index < 0 ? "field" : String(record.index);
  return `${QUARANTINE_PREFIX}${safeSegment(record.kind)}.${safeSegment(record.id ?? "anonymous")}.${position}.${rawDigest(record.raw)}`;
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

/** The untouched original of a store that could not be used at all. */
function wholeStore(raw: string): { key: string; value: string } {
  return { key: `${QUARANTINE_PREFIX}store.${rawDigest(raw)}`, value: raw };
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
    const backup: BackupEnvelope | null =
      existingBackup === null || backupRank(existingBackup) < RANK.unreadable
        ? { version: 1, raw, quality: "unreadable", at }
        : null;
    // The one backup may already hold an older, better copy. This original is about to be saved over, so then it
    // gets a copy of its own.
    const copies = backup ? [] : [wholeStore(raw)];
    return {
      data: null,
      backup,
      quarantine: copies,
      issue: { ...issue, quarantinedKeys: copies.map((entry) => entry.key) },
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
    quarantine: usable ? quarantine : candidate ? [] : [wholeStore(raw)],
    issue: issue && !usable ? { ...issue, quarantinedKeys: candidate ? [] : [wholeStore(raw).key] } : issue,
  };
}

// ── Safety-copy gate ────────────────────────────────────────────────────────

/** Copies still missing for this storage. Empty means saves may proceed. */
export function pendingSafetyCopies(storage: object): readonly SafetyCopy[] {
  return pendingByStorage.get(storage) ?? NO_PENDING;
}

export function hasPendingSafetyCopies(storage: object): boolean {
  return pendingSafetyCopies(storage).length > 0;
}

/** Drop the gate (tests, or an explicit new load that no longer needs it). */
export function clearPendingSafetyCopies(storage: object): void {
  pendingByStorage.delete(storage);
}

function copyIsThere(storage: RecoveryStorage, copy: SafetyCopy): boolean {
  try {
    return storage.getItem(copy.key) === copy.value;
  } catch {
    return false;
  }
}

/** Write a copy and verify it by reading it back; never trust setItem alone. */
function writeCopy(storage: RecoveryStorage, copy: SafetyCopy): boolean {
  if (copyIsThere(storage, copy)) return true;
  try {
    storage.setItem(copy.key, copy.value);
  } catch {
    return false;
  }
  return copyIsThere(storage, copy);
}

/** Later copies for the same key supersede earlier ones. */
function mergeCopies(existing: readonly SafetyCopy[], added: readonly SafetyCopy[]): SafetyCopy[] {
  const byKey = new Map<string, string>();
  for (const copy of [...existing, ...added]) byKey.set(copy.key, copy.value);
  return [...byKey].map(([key, value]) => ({ key, value }));
}

/** Try every missing copy again. Returns true only when all of them exist. */
export function retrySafetyCopies(storage: RecoveryStorage): boolean {
  const missing = pendingByStorage.get(storage);
  if (!missing?.length) return true;
  const stillMissing = missing.filter((copy) => !writeCopy(storage, copy));
  if (stillMissing.length) pendingByStorage.set(storage, stillMissing);
  else pendingByStorage.delete(storage);
  return stillMissing.length === 0;
}

export const ensureSafetyCopies = retrySafetyCopies;

/** Apply a plan to storage. Every needed copy must be verified before a save
 *  is allowed to replace the data key. */
export function recoverStored(raw: string | null, storage: RecoveryStorage): LoadResult {
  let plan: RecoveryPlan;
  let needed: SafetyCopy[] = [];
  try {
    // Reading the existing backup can fail too; then nothing may be saved over
    // the original, because we cannot tell whether it was copied already.
    const existingBackup = storage.getItem(BACKUP_KEY);
    try {
      plan = planRecovery(raw, existingBackup);
    } catch {
      plan = { data: null, quarantine: [], backup: null, issue: null };
      needed = [{ key: BACKUP_KEY, value: existingBackup ?? "\u0000unverifiable-backup" }];
    }
    if (plan.backup) needed.push({ key: BACKUP_KEY, value: JSON.stringify(plan.backup) });
    needed.push(...plan.quarantine);
  } catch {
    // get/set on the storage itself failed: hold every save.
    needed = [{ key: BACKUP_KEY, value: "\u0000unverifiable-storage" }];
    plan = { data: null, quarantine: [], backup: null, issue: null };
  }

  const all = mergeCopies(pendingSafetyCopies(storage), needed);
  const failed = all.filter((copy) => !writeCopy(storage, copy));
  if (failed.length) pendingByStorage.set(storage, failed);
  else pendingByStorage.delete(storage);

  const result: LoadResult = { data: plan.data, issue: plan.issue };
  if (failed.length) result.blocked = true;
  return result;
}
