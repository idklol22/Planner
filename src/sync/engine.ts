/** Offline-first sync with the Planner hub. Framework-agnostic: the caller
 *  supplies the local-store seams and decides when to start/stop. */

import type { HubClient, PullRow, PullTable } from "../storage/hub";
import { isNewerRow, LocalOutbox, type Outbox } from "./queue";

export const PUSH_BATCH_SIZE = 200;
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 60_000;
/** When the hub last synced successfully (shown in Settings). */
export const LAST_SYNC_KEY = "planner.lastSynced.v1";
export const CURSOR_KEY = "planner.cursor.v1";

type SyncClient = Pick<HubClient, "push" | "pull">;

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
  }

  /** Drain the outbox in batches of 200. Failures keep the ops and retry with
   *  exponential backoff; the promise resolves either way so background calls
   *  never produce unhandled rejections. */
  push(): Promise<void> {
    return this.exclusive(() => this.doPush());
  }

  /** Walk /sync until `more` is false, applying last-write-wins rows and
   *  persisting the cursor after every page. */
  pull(): Promise<void> {
    return this.exclusive(() => this.doPull());
  }

  syncNow(): Promise<void> {
    return this.exclusive(async () => {
      await this.doPush();
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

  private async doPush(): Promise<void> {
    try {
      for (;;) {
        const batch = this.outbox.pending(PUSH_BATCH_SIZE);
        if (batch.length === 0) break;
        await this.options.client.push(batch);
        this.outbox.ack(batch);
      }
      this.clearBackoff();
    } catch {
      this.scheduleRetry();
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

  private async doPull(): Promise<void> {
    try {
      let since = this.options.cursorStore.get();
      for (;;) {
        const previous = since;
        const page = await this.options.client.pull(since);
        for (const { table, row } of page.changes) {
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
    } catch {
      // Keep the last good cursor; the next sync re-fetches this page.
    }
  }
}
