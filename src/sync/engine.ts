/** Offline-first sync with the Planner hub. Framework-agnostic: the caller
 *  supplies the local-store seams and decides when to start/stop. */

import type { HubClient, HubOp, PullRow, PullTable } from "../storage/hub";
import {
  type ConflictRecord,
  type ConflictStore,
  LocalConflictStore,
  sameRowContent,
} from "./conflicts";
import { isNewerRow, LocalOutbox, type Outbox } from "./queue";

export const PUSH_BATCH_SIZE = 200;
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;
/** When the hub last synced successfully (shown in Settings). */
export const LAST_SYNC_KEY = "planner.lastSynced.v1";
export const CURSOR_KEY = "planner.cursor.v1";

type SyncClient = Pick<HubClient, "push" | "pull">;
/** A hub row plus the table it came from, kept while investigating a push. */
type SeenRow = { table: PullTable; row: PullRow };

export interface CursorStore {
  get(): number;
  set(cursor: number): void;
}

export interface SyncEngineOptions {
  client: SyncClient;
  getLocal(table: PullTable, id: string): PullRow | null | undefined;
  applyRemote(table: PullTable, row: PullRow): void | Promise<void>;
  cursorStore: CursorStore;
  /** Defaults to a localStorage-backed outbox. */
  outbox?: Outbox;
  /** Where rejected rows are copied before the next pull replaces them. */
  conflicts?: ConflictStore;
  /** Called at most once per sync with the rows that were not saved. */
  onConflicts?(records: ConflictRecord[]): void;
}

/** Ready-made browser cursor store; any { get, set } object works too. */
export function localCursorStore(key = CURSOR_KEY): CursorStore {
  return {
    get() {
      const raw = localStorage.getItem(key);
      const value = raw === null ? 0 : Number(raw);
      return Number.isFinite(value) ? value : 0;
    },
    set(cursor) {
      localStorage.setItem(key, String(cursor));
    },
  };
}

export class SyncEngine {
  readonly outbox: Outbox;
  private readonly conflicts: ConflictStore;

  private interval: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  /** Serialises push/pull/syncNow so overlapping triggers cannot interleave. */
  private chain: Promise<unknown> = Promise.resolve();

  private readonly onOnline = () => {
    void this.syncNow().catch(() => {});
  };

  private readonly onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      void this.syncNow().catch(() => {});
    }
  };

  constructor(private readonly options: SyncEngineOptions) {
    this.outbox = options.outbox ?? new LocalOutbox();
    this.conflicts = options.conflicts ?? new LocalConflictStore();
  }

  /** Drain the outbox in batches of 200. Failures keep the ops and retry with
   *  exponential backoff; the promise resolves either way so background calls
   *  never produce unhandled rejections. */
  push(): Promise<void> {
    return this.exclusive(() => this.runPush());
  }

  /** Walk /sync until `more` is false, applying last-write-wins rows and
   *  persisting the cursor after every page. */
  pull(): Promise<void> {
    return this.exclusive(async () => {
      await this.doPull();
    });
  }

  syncNow(): Promise<void> {
    return this.exclusive(async () => {
      await this.runPush();
      await this.doPull();
    });
  }

  /** Periodic sync plus `online` and tab-visibility triggers. */
  start(intervalMs: number): void {
    this.stop();
    this.interval = setInterval(() => {
      void this.syncNow().catch(() => {});
    }, intervalMs);
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisible);
    }
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.clearBackoff();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisible);
    }
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(fn, fn);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Report once per sync, however many batches were affected. */
  private async runPush(): Promise<void> {
    const lost: ConflictRecord[] = [];
    await this.doPush(lost);
    if (lost.length > 0) {
      try {
        this.options.onConflicts?.(lost);
      } catch {
        // A broken notification must not fail the sync itself.
      }
    }
  }

  /** Drain the outbox in batches of 200. Failures keep the ops and retry with
   *  exponential backoff; the promise resolves either way so background calls
   *  never produce unhandled rejections. */
  private async doPush(lost: ConflictRecord[]): Promise<void> {
    try {
      for (;;) {
        const batch = this.outbox.pending(PUSH_BATCH_SIZE);
        if (batch.length === 0) break;
        const result = await this.options.client.push(batch);
        // A rejected row must not replay forever: ack it, then resolve it from
        // the hub's current rows and keep a local copy of the losing version.
        this.outbox.ack(batch);
        if (result.applied < batch.length) await this.investigate(batch, lost);
      }
      this.clearBackoff();
    } catch {
      this.scheduleRetry();
    }
  }

  /** The hub only reports how many ops it applied. Read the rows back so a
   *  genuine last-write-wins loss is told apart from a harmless repeat. */
  private async investigate(sent: HubOp[], lost: ConflictRecord[]): Promise<void> {
    const wanted = new Map<string, HubOp>();
    for (const op of sent) wanted.set(`${op.table}:${op.row.id}`, op);
    const found = new Map<string, SeenRow>();
    try {
      // Also converges local data to the hub copy and advances the cursor, so
      // the next pull does not silently replace anything behind our back.
      await this.doPull(found, new Set(wanted.keys()));
    } catch {
      // Fall back to the scan below.
    }
    if (found.size < wanted.size) {
      // The winning hub write may predate our cursor; read once from the start.
      try {
        await this.scanFromStart(new Set(wanted.keys()), found);
      } catch {
        // Keep an unconfirmed copy rather than guessing which row won.
      }
    }
    // Rows found by the from-the-start scan predate the cursor, so apply them
    // here too. The `isNewerRow` guard makes this a no-op for rows doPull
    // already applied.
    try {
      for (const { table, row } of found.values()) {
        if (isNewerRow(row, this.options.getLocal(table, row.id))) {
          await this.options.applyRemote(table, row);
        }
      }
    } catch {
      // The rejected row is already copied below; do not replay the batch.
    }

    const at = new Date().toISOString();
    const records: ConflictRecord[] = [];
    for (const [key, op] of wanted) {
      const hubRow = found.get(key)?.row;
      if (!hubRow) {
        // The count says something lost, but we cannot identify the winner.
        records.push({ table: op.table, row: op.row, savedAt: at, reason: "unconfirmed" });
      } else if (isNewerRow(hubRow, op.row) && !sameRowContent(hubRow, op.row)) {
        records.push({ table: op.table, row: op.row, savedAt: at, reason: "superseded" });
      }
      // Otherwise the hub already has this row: a repeat, not a conflict.
    }
    if (records.length === 0) return;
    this.conflicts.save(records, at);
    lost.push(...records);
  }

  /** Read-only page walk for rows written before our cursor. The guard against
   *  a non-advancing cursor keeps this from looping forever. */
  private async scanFromStart(keys: Set<string>, found: Map<string, SeenRow>): Promise<void> {
    let since = 0;
    for (;;) {
      const page = await this.options.client.pull(since);
      for (const { table, row } of page.changes) {
        const key = `${table}:${row.id}`;
        if (keys.has(key) && !found.has(key)) found.set(key, { table, row });
      }
      if (!page.more || page.cursor <= since) break;
      since = page.cursor;
    }
  }

  private scheduleRetry(): void {
    this.failures += 1;
    if (this.retry !== null) return;
    const delay = Math.min(
      RETRY_BASE_MS * 2 ** (this.failures - 1),
      RETRY_MAX_MS,
    );
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.push().catch(() => {});
    }, delay);
  }

  private clearBackoff(): void {
    this.failures = 0;
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  /** `collect` / `only` let a push investigation see the hub's rows without a
   *  second request; normal pulls apply them as before. */
  private async doPull(
    collect?: Map<string, SeenRow>,
    only?: Set<string>,
  ): Promise<boolean> {
    try {
      let since = this.options.cursorStore.get();
      for (;;) {
        const previous = since;
        const page = await this.options.client.pull(since);
        for (const { table, row } of page.changes) {
          const key = `${table}:${row.id}`;
          if (collect && (!only || only.has(key))) collect.set(key, { table, row });
          if (isNewerRow(row, this.options.getLocal(table, row.id))) {
            await this.options.applyRemote(table, row);
          }
        }
        if (page.cursor > previous) {
          since = page.cursor;
          this.options.cursorStore.set(since);
        }
        // A non-advancing cursor with `more` set would loop forever.
        if (!page.more || page.cursor <= previous) break;
      }
      return true;
    } catch {
      // Keep the last good cursor; the next sync re-fetches this page.
      return false;
    }
  }
}
