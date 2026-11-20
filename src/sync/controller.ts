/** Framework-free glue between the Planner's local data and the hub.
 *
 *  - local mutations (`handleChange`) become outbox ops
 *  - pulled rows (`applyRemote`) merge into local data or the read-only mirror
 *  - `syncNow` = push, pull, poll LetCode events, refresh pending commands
 *  React only supplies `getData` / `apply` and renders the status. */

import type { ISODate } from "../domain/dates";
import type { AppData, HandoffState } from "../domain/model";
import {
  applySolved,
  type StoreOp,
} from "../integrations/letcode";
import { pollPracticeEvents } from "../integrations/letcode-events";
import {
  isMirrorTable,
  type HubClient,
  type PullResult,
  type PullRow,
  type PullTable,
  type PushResult,
  type HubOp,
} from "../storage/hub";
import { parseNoteItems, type NoteItem } from "../lib/absorb";
import type { HarnessNote } from "../lib/harness";
import { SyncEngine, type CursorStore } from "./engine";
import { keepaliveBatch, KEEPALIVE_MAX_BYTES, KEEPALIVE_MAX_OPS } from "./flush";
import {
  allOps,
  applyMirrorRow,
  applyRemoteRow,
  diffOps,
  emptyMirror,
  getLocalRow,
  getMirrorRow,
  type Mirror,
} from "./mapping";
import type { Outbox } from "./queue";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MIRROR_KEY = "planner.mirror.v1";
export const LETCODE_CURSOR_KEY = "planner.letcode.cursor.v1";
export const LETCODE_SEEN_KEY = "planner.letcode.seen.v1";
const LETCODE_SEEN_MAX = 500;

type ControllerClient = Pick<HubClient, "push" | "pull" | "getEvents" | "postCommand" | "getCommand">;

export interface ActionsForLetcode {
  addDoneTask(categoryId: string, title: string, date: ISODate): void;
  toggleTask(id: string): void;
}

export interface SyncControllerOptions {
  client: ControllerClient;
  getData(): AppData;
  /** Must update what `getData` returns synchronously. */
  apply(fn: (data: AppData) => AppData): void;
  storage: KeyValueStorage;
  outbox: Outbox;
  cursorStore: CursorStore;
  /** Best-effort, fire-and-forget push used by `flush()`. */
  keepalive?(ops: HubOp[]): boolean;
  letcode: ActionsForLetcode;
  recordHandoff(taskId: string, patch: Partial<HandoffState>): void;
  /** A finished `harness.note` command returned the dated items it found. */
  onNoteItems?(categoryId: string, items: NoteItem[]): void;
  onMirror?(mirror: Mirror): void;
  today?(): ISODate;
  now?(): Date;
}

export interface SyncStatus {
  syncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  pending: number;
}

function readJson<T>(storage: KeyValueStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the next sync recomputes from the hub.
  }
}

const TERMINAL = new Set(["done", "failed"]);

export class SyncController {
  readonly engine: SyncEngine;
  mirror: Mirror;
  status: SyncStatus = { syncing: false, lastSyncedAt: null, error: null, pending: 0 };

  private listeners = new Set<() => void>();
  /** `table:id` → updatedAt of rows we just wrote from the hub (not local edits). */
  private readonly remote = new Map<string, string>();
  private lastError: string | null = null;

  constructor(private readonly o: SyncControllerOptions) {
    this.mirror = { ...emptyMirror(), ...readJson<Partial<Mirror>>(o.storage, MIRROR_KEY, {}) };
    const track = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
      async (...a: A): Promise<R> => {
        try {
          const out = await fn(...a);
          this.lastError = null;
          return out;
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error);
          throw error;
        }
      };
    const client = {
      push: track((ops: HubOp[]): Promise<PushResult> => o.client.push(ops)),
      pull: track((since?: number): Promise<PullResult> => o.client.pull(since)),
    };
    this.engine = new SyncEngine({
      client,
      getLocal: (table, id) => this.getLocal(table, id),
      applyRemote: (table, row) => this.applyRemote(table, row),
      cursorStore: o.cursorStore,
      outbox: o.outbox,
    });
    this.status.pending = o.outbox.size();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<SyncStatus> = {}): void {
    this.status = { ...this.status, ...patch, pending: this.o.outbox.size() };
    for (const fn of this.listeners) fn();
  }

  getLocal(table: PullTable, id: string): PullRow | null {
    if (isMirrorTable(table)) return getMirrorRow(this.mirror, table, id);
    return getLocalRow(this.o.getData(), table, id);
  }

  applyRemote(table: PullTable, row: PullRow): void {
    if (isMirrorTable(table)) {
      this.mirror = applyMirrorRow(this.mirror, table, row as never);
      writeJson(this.o.storage, MIRROR_KEY, this.mirror);
      this.o.onMirror?.(this.mirror);
      return;
    }
    this.remote.set(`${table}:${row.id}`, row.updatedAt);
    this.o.apply((data) => applyRemoteRow(data, table, row as never));
  }

  /** Call whenever local data changes; queues ops for changed records. */
  handleChange(prev: AppData, next: AppData): void {
    if (prev === next) return;
    const ops = diffOps(prev, next).filter((op) => {
      const key = `${op.table}:${op.row.id}`;
      if (this.remote.get(key) === op.row.updatedAt) {
        this.remote.delete(key);
        return false;
      }
      return true;
    });
    if (ops.length === 0) return;
    this.o.outbox.enqueueAll(ops);
    this.emit();
  }

  /** First connect: queue everything we already have. */
  seedOutbox(): void {
    this.o.outbox.enqueueAll(allOps(this.o.getData()));
    this.emit();
  }

  async syncNow(): Promise<void> {
    if (this.status.syncing) return;
    this.emit({ syncing: true });
    try {
      await this.engine.syncNow();
      await this.pollLetcode().catch(() => {});
      await this.trackCommands().catch(() => {});
    } finally {
      const failed = this.lastError;
      this.emit({
        syncing: false,
        error: failed,
        lastSyncedAt: failed ? this.status.lastSyncedAt : (this.o.now?.() ?? new Date()).toISOString(),
      });
    }
  }

  /** Best-effort push on tab hide / app close. Sends at most one small batch;
   *  never acks ops (a response cannot be awaited here and hub upserts are
   *  idempotent on `updatedAt`) and never emits a status change. */
  flush(): void {
    const ops = this.o.outbox.pending(KEEPALIVE_MAX_OPS);
    const batch = keepaliveBatch(ops, KEEPALIVE_MAX_OPS, KEEPALIVE_MAX_BYTES);
    if (batch.length === 0 || !this.o.keepalive) return;
    this.o.keepalive(batch);
  }

  /** Poll `practice.solved` events and apply each exactly once. */
  async pollLetcode(): Promise<number> {
    const storedCursor = readJson<number | string>(this.o.storage, LETCODE_CURSOR_KEY, 0);
    const { events, cursor } = await pollPracticeEvents(this.o.client, storedCursor);
    const seen = new Set(readJson<string[]>(this.o.storage, LETCODE_SEEN_KEY, []));
    const today = this.o.today?.() ?? (new Date().toISOString().slice(0, 10) as ISODate);
    let applied = 0;
    for (const event of events) {
      const ops: StoreOp[] = applySolved(this.o.getData(), event, today, seen);
      for (const op of ops) {
        if (op.kind === "toggle") this.o.letcode.toggleTask(op.taskId);
        else this.o.letcode.addDoneTask(op.categoryId, op.title, op.date);
        applied += 1;
      }
    }
    writeJson(this.o.storage, LETCODE_SEEN_KEY, [...seen].slice(-LETCODE_SEEN_MAX));
    writeJson(this.o.storage, LETCODE_CURSOR_KEY, cursor);
    return applied;
  }

  /** Queue a `harness.note` command; returns its id. */
  async sendNote(note: HarnessNote): Promise<string> {
    const { id } = await this.o.client.postCommand("harness.note", note);
    return id;
  }

  /** Refresh the status of every note hand-off whose command is still open. */
  async trackCommands(): Promise<void> {
    for (const task of this.o.getData().tasks) {
      const h = task.note?.handoff;
      if (!h?.commandId || (h.commandStatus && TERMINAL.has(h.commandStatus))) continue;
      const command = await this.o.client.getCommand(h.commandId);
      if (!command || command.status === h.commandStatus) continue;
      if (command.status === "done") {
        this.o.recordHandoff(task.id, { status: "sent", commandStatus: "done", error: undefined });
        const items = parseNoteItems((command.result as { items?: unknown } | null)?.items);
        if (task.categoryId && items.length) this.o.onNoteItems?.(task.categoryId, items);
      } else if (command.status === "failed") {
        const result = command.result as { error?: unknown } | null;
        const error = typeof result?.error === "string" ? result.error : "Harness command failed";
        this.o.recordHandoff(task.id, { status: "failed", commandStatus: "failed", error });
      } else {
        this.o.recordHandoff(task.id, { commandStatus: command.status });
      }
    }
  }

  hasOpenCommands(): boolean {
    return this.o
      .getData()
      .tasks.some((t) => {
        const h = t.note?.handoff;
        return Boolean(h?.commandId) && !(h?.commandStatus && TERMINAL.has(h.commandStatus));
      });
  }

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly kick = () => {
    void this.syncNow().catch(() => {});
  };

  /** Periodic sync plus online / tab-visible triggers. */
  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(this.kick, intervalMs);
    if (typeof window !== "undefined") window.addEventListener("online", this.kick);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.kick);
    this.kick();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.engine.stop();
    if (typeof window !== "undefined") window.removeEventListener("online", this.kick);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.kick);
  }
}
