/** Local safety copies for edits the hub refused to store.
 *
 *  The hub answers /ops with `{ applied, cursor }` only. When a row loses a
 *  last-write-wins race, the app must keep the rejected row verbatim before the
 *  next pull replaces the local copy. NOTE: `src/storage/reset.ts` needs
 *  `CONFLICTS_KEY` added to `RESET_KEYS` so "Reset all data" clears these copies
 *  like it clears other backups. That file is not owned by this change.
 */

import type { PullRow, SyncRow, SyncTable } from "../storage/hub";

export const CONFLICTS_KEY = "planner.conflicts.v1";
export const MAX_CONFLICTS = 50;

/** `superseded`: the hub's row is newer and differs from what we sent.
 *  `unconfirmed`: the hub did not apply the op but we could not identify its
 *  current row, so we keep the copy without claiming a known conflict. */
export type ConflictReason = "superseded" | "unconfirmed";

export interface ConflictRecord {
  table: SyncTable;
  /** The rejected row, stored exactly as it was sent. */
  row: SyncRow;
  savedAt: string;
  reason: ConflictReason;
}

export type ConflictInput = Omit<ConflictRecord, "savedAt">;

export interface ConflictStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ConflictStore {
  /** True only when every copy was actually persisted; the caller must not
   *  promise the user a copy that could not be written. */
  save(records: ConflictInput[], at?: string): boolean;
  all(): ConflictRecord[];
}

export function conflictKey(record: Pick<ConflictRecord, "table" | "row">): string {
  return `${record.table}:${record.row.id}`;
}

function isConflictRecord(value: unknown): value is ConflictRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ConflictRecord>;
  if (typeof record.table !== "string") return false;
  if (!record.row || typeof record.row !== "object") return false;
  const row = record.row as { id?: unknown; updatedAt?: unknown };
  return (
    typeof row.id === "string" &&
    typeof row.updatedAt === "string" &&
    typeof record.savedAt === "string" &&
    (record.reason === "superseded" || record.reason === "unconfirmed")
  );
}

/** Drop LWW stamps so a newer hub row with the same content is recognised as
 *  a harmless repeat rather than a conflict. Nested note stamps are metadata
 *  too, not content. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonical(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "updatedAt") continue;
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function sameRowContent(a: PullRow, b: PullRow): boolean {
  return sameContent(a, b);
}

/** A note from the rejected op can survive a pull when the controller merges
 *  the newer local note into the winning hub row. In that case the user has
 *  not lost the edit, so it is not a conflict worth alarming about. */
export function noteWasPreserved(
  sent: PullRow,
  hub: PullRow,
  local: PullRow | null | undefined,
): boolean {
  if (!local) return false;
  const note = (sent as { note?: unknown }).note;
  if (!note || typeof note !== "object") return false;
  // The note must actually be the disputed field; otherwise other edits in
  // this row were genuinely lost and still need to be reported.
  if (sameContent(note, (hub as { note?: unknown }).note)) return false;
  return sameContent(note, (local as { note?: unknown }).note);
}

/** One line per sync: name at most two items and say what happened to them. */
export function describeConflicts(records: ConflictRecord[], copyKept = true): string {
  const kept = copyKept
    ? "A copy was kept on this device."
    : "No copy could be kept on this device (storage may be full).";
  const known = records.filter((record) => record.reason === "superseded");
  if (known.length === 0) {
    return `Some changes could not be saved on the hub. ${kept}`;
  }
  const label = (record: ConflictRecord) => {
    const row = record.row as unknown as { title?: unknown; name?: unknown; label?: unknown };
    for (const value of [row.title, row.name, row.label]) {
      if (typeof value === "string" && value.trim()) return value;
    }
    return `${record.table}:${record.row.id}`;
  };
  const names = known.slice(0, 2).map(label);
  const rest = known.length > 2 ? ` and ${known.length - 2} more` : "";
  const items = `${names.join(", ")}${rest}`;
  return `${items} ${known.length === 1 ? "was" : "were"} not saved because a newer version exists on another device. ${kept}`;
}

export class LocalConflictStore implements ConflictStore {
  /** Defaults to browser localStorage; injectable for tests/native hosts. */
  constructor(private readonly storage?: ConflictStorage) {}

  private get store(): ConflictStorage {
    return this.storage ?? localStorage;
  }

  all(): ConflictRecord[] {
    try {
      const raw = this.store.getItem(CONFLICTS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isConflictRecord).slice(-MAX_CONFLICTS);
    } catch {
      return [];
    }
  }

  save(records: ConflictInput[], at = new Date().toISOString()): boolean {
    if (records.length === 0) return true;
    const incoming = new Map<string, ConflictRecord>();
    for (const record of records) {
      incoming.set(conflictKey(record), { ...record, savedAt: at });
    }
    // A later version of the same row replaces the earlier copy and moves it
    // to the newest end, so the list stays deduplicated and bounded.
    const merged = new Map<string, ConflictRecord>();
    for (const existing of this.all()) {
      if (!incoming.has(conflictKey(existing))) merged.set(conflictKey(existing), existing);
    }
    for (const [key, record] of incoming) merged.set(key, record);
    const kept = [...merged.values()].slice(-MAX_CONFLICTS);
    try {
      this.store.setItem(CONFLICTS_KEY, JSON.stringify(kept));
      return true;
    } catch {
      // Quota or private mode: say so instead of promising a kept copy.
      return false;
    }
  }
}
