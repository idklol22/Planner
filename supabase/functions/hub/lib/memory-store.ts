/** In-memory HubStore + FileStore, used by the ported vitest suite. */

import type {
  ByteRange,
  CategoryRow,
  CommandInput,
  CommandRow,
  CommandStatus,
  Device,
  EventInput,
  EventResult,
  EventRow,
  EventsResult,
  FileMeta,
  HealthRow,
  FileObject,
  FileStore,
  HubOp,
  HubStore,
  MealRow,
  SyncChange,
  SyncResult,
  SyncRow,
  SyncTable,
  TaskRow,
  UpsertResult,
  WidgetProfile,
} from "./db.ts";
import { redactCommandPayload, shouldRedactCommand } from "./command-payload.ts";
import { compareUpdatedAt, normalize, sha256Hex } from "./logic.ts";
import { mergeHealthPush, type HealthPushRow } from "./widget.ts";

interface StoredDevice extends Device {
  tokenHash: string;
  revokedAt: string | null;
}

export interface ChangeLogEntry {
  seq: number;
  table: SyncTable;
  rowId: string;
  updatedAt: string;
}

interface StoredEvent extends EventRow {
  seq: number;
}

function eventRow(stored: StoredEvent): EventRow {
  return {
    id: stored.id,
    type: stored.type,
    source: stored.source,
    origin: stored.origin,
    payload: stored.payload,
    ts: stored.ts,
    idempotencyKey: stored.idempotencyKey,
  };
}

/** Volatile stand-in for the Supabase Postgres database. */
export class MemoryStore implements HubStore {
  private devices = new Map<string, StoredDevice>();
  private rows = new Map<SyncTable, Map<string, Record<string, unknown>>>();
  private changeLog: ChangeLogEntry[] = [];
  private seq = 0;
  private events: StoredEvent[] = [];
  private eventSeq = 0;
  private commands = new Map<string, CommandRow>();
  private commandOrder = new Map<string, number>();
  private commandSeq = 0;
  private widgetProfile: WidgetProfile | null = null;

  async findDeviceByTokenHash(hash: string): Promise<Device | null> {
    const device = this.devices.get(hash);
    if (!device || device.revokedAt) return null;
    return { id: device.id, role: device.role };
  }

  async upsertRows(ops: HubOp[]): Promise<UpsertResult> {
    const applied: SyncChange[] = [];
    for (const op of ops) {
      const row = normalize(op.row as unknown as Record<string, unknown>);
      const id = String(row.id);
      const updatedAt = String(row.updatedAt);
      let table = this.rows.get(op.table);
      if (!table) {
        table = new Map();
        this.rows.set(op.table, table);
      }
      const existing = table.get(id);
      if (existing && compareUpdatedAt(updatedAt, existing.updatedAt) < 0) continue;
      // A health push may be partial: keep stored metrics/workouts that the
      // request did not mention. LWW was already checked above.
      const stored = op.table === "health"
        ? mergeHealthPush(
            existing ? (existing as unknown as HealthRow) : null,
            row as unknown as HealthPushRow,
          )
        : row;
      table.set(id, stored);
      this.seq += 1;
      this.changeLog.push({ seq: this.seq, table: op.table, rowId: id, updatedAt });
      applied.push({ table: op.table, row: stored as unknown as SyncChange["row"] });
    }
    return { applied: applied.length, cursor: this.seq, rows: applied };
  }

  async changesSince(since: number, limit: number): Promise<SyncResult> {
    const matching = this.changeLog
      .filter((entry) => entry.seq > since)
      .sort((a, b) => a.seq - b.seq);
    const more = matching.length > limit;
    const page = more ? matching.slice(0, limit) : matching;
    const changes: SyncChange[] = [];
    for (const entry of page) {
      const row = this.rows.get(entry.table)?.get(entry.rowId);
      if (!row) continue;
      changes.push({ table: entry.table, row: row as unknown as SyncChange["row"] });
    }
    const cursor = page.length ? page[page.length - 1].seq : since;
    return { changes, cursor, more };
  }

  async insertEvent(input: EventInput): Promise<EventResult> {
    const existing = this.events.find((event) => event.idempotencyKey === input.idempotencyKey);
    if (existing) return { id: existing.id, deduplicated: true };
    this.eventSeq += 1;
    this.events.push({ seq: this.eventSeq, ...input });
    return { id: input.id, deduplicated: false };
  }

  async eventsSince(since: number | string, limit: number): Promise<EventsResult> {
    const numeric = typeof since === "number";
    const matching = this.events
      .filter((event) => (numeric ? event.seq > since : event.ts > since))
      .sort((a, b) => a.seq - b.seq);
    const more = matching.length > limit;
    const page = more ? matching.slice(0, limit) : matching;
    const cursor = page.length
      ? numeric
        ? page[page.length - 1].seq
        : page[page.length - 1].ts
      : since;
    return { events: page.map(eventRow), cursor, more };
  }

  async enqueueCommand(command: CommandInput): Promise<{ id: string }> {
    const now = new Date().toISOString();
    this.commandSeq += 1;
    this.commandOrder.set(command.id, this.commandSeq);
    this.commands.set(command.id, {
      id: command.id,
      type: command.type,
      payload: command.payload,
      status: "queued",
      claimedBy: null,
      leaseUntil: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    });
    return { id: command.id };
  }

  async getCommand(id: string): Promise<CommandRow | null> {
    const command = this.commands.get(id);
    return command ? { ...command } : null;
  }

  async claimCommand(device: string, leaseSec: number): Promise<CommandRow | null> {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + leaseSec * 1000).toISOString();
    const candidates = [...this.commands.values()]
      .filter(
        (command) =>
          command.status === "queued" ||
          (command.status === "claimed" && command.leaseUntil !== null && command.leaseUntil <= now),
      )
      .sort((a, b) => {
        const byCreated = a.createdAt.localeCompare(b.createdAt);
        return byCreated || (this.commandOrder.get(a.id) ?? 0) - (this.commandOrder.get(b.id) ?? 0);
      });
    const target = candidates[0];
    if (!target) return null;
    const claimed: CommandRow = {
      ...target,
      status: "claimed",
      claimedBy: device,
      leaseUntil,
      updatedAt: now,
    };
    this.commands.set(target.id, claimed);
    return { ...claimed };
  }

  async completeCommand(
    id: string,
    status: CommandStatus,
    result: unknown,
  ): Promise<CommandRow | null> {
    const existing = this.commands.get(id);
    if (!existing) return null;
    const completed: CommandRow = {
      ...existing,
      status,
      result,
      leaseUntil: null,
      updatedAt: new Date().toISOString(),
    };
    // A successfully completed note hand-off must not keep image bytes in the
    // stored payload. Failures and retries keep them, and a repeated completion
    // stays idempotent because the payload is already redacted.
    if (shouldRedactCommand(existing.type, status)) {
      completed.payload = redactCommandPayload(existing.payload);
    }
    this.commands.set(id, completed);
    return { ...completed };
  }

  async timedTasks(): Promise<TaskRow[]> {
    const tasks = this.rows.get("task");
    if (!tasks) return [];
    return [...tasks.values()]
      .filter(
        (row) =>
          typeof row.time === "string" &&
          row.time !== "" &&
          (row.deletedAt === null || row.deletedAt === undefined),
      )
      .sort((a, b) => {
        const byDate = String(a.date).localeCompare(String(b.date));
        return (
          byDate ||
          Number(a.order) - Number(b.order) ||
          String(a.id).localeCompare(String(b.id))
        );
      })
      .map((row) => row as unknown as TaskRow);
  }

  async getSyncRow(table: SyncTable, id: string): Promise<SyncRow | null> {
    const row = this.rows.get(table)?.get(id);
    return row ? (row as unknown as SyncRow) : null;
  }

  async listWidgetTasks(date: string): Promise<TaskRow[]> {
    const tasks = this.rows.get("task");
    if (!tasks) return [];
    return [...tasks.values()]
      .filter(
        (row) =>
          (row.deletedAt === null || row.deletedAt === undefined) &&
          (row.archivedAt === null || row.archivedAt === undefined) &&
          (!row.done || String(row.date) >= date),
      )
      .sort((a, b) => {
        const byDate = String(a.date).localeCompare(String(b.date));
        return (
          byDate ||
          Number(a.order) - Number(b.order) ||
          String(a.id).localeCompare(String(b.id))
        );
      })
      .map((row) => row as unknown as TaskRow);
  }

  async listWidgetCategories(): Promise<CategoryRow[]> {
    const categories = this.rows.get("category");
    if (!categories) return [];
    return [...categories.values()]
      .filter(
        (row) =>
          (row.deletedAt === null || row.deletedAt === undefined) && !row.archived,
      )
      .sort((a, b) => Number(a.order) - Number(b.order) || String(a.id).localeCompare(String(b.id)))
      .map((row) => row as unknown as CategoryRow);
  }

  async listWidgetMeals(date: string): Promise<MealRow[]> {
    const meals = this.rows.get("meal");
    if (!meals) return [];
    return [...meals.values()]
      .filter(
        (row) =>
          row.date === date && (row.deletedAt === null || row.deletedAt === undefined),
      )
      .map((row) => row as unknown as MealRow);
  }

  async getWidgetProfile(): Promise<WidgetProfile | null> {
    return this.widgetProfile ? { ...this.widgetProfile, data: { ...this.widgetProfile.data } } : null;
  }

  async putWidgetProfile(data: Record<string, unknown>): Promise<void> {
    this.widgetProfile = { id: "default", data, updatedAt: new Date().toISOString() };
  }

  async replaceWidgetDevice(tokenHash: string): Promise<void> {
    const now = new Date().toISOString();
    for (const device of this.devices.values()) {
      if (device.role === "widget") device.revokedAt = now;
    }
    this.devices.set(tokenHash, {
      id: `dev_${crypto.randomUUID()}`,
      role: "widget",
      tokenHash,
      revokedAt: null,
    });
  }

  /** Test introspection into registered devices. */
  listDevices(): Array<{ id: string; role: string; tokenHash: string; revokedAt: string | null }> {
    return [...this.devices.values()].map((device) => ({ ...device }));
  }

  // ── Test helpers (not part of the HubStore contract) ──────────────────────

  async seedDevice(
    token: string,
    options: { name?: string; revoked?: boolean; role?: string } = {},
  ): Promise<string> {
    const id = `dev_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const tokenHash = await sha256Hex(token);
    this.devices.set(tokenHash, {
      id,
      role: options.role ?? "user",
      tokenHash,
      revokedAt: options.revoked ? now : null,
    });
    return id;
  }

  getRow(table: SyncTable, id: string): Record<string, unknown> | undefined {
    return this.rows.get(table)?.get(id);
  }

  insertRow(table: SyncTable, row: Record<string, unknown>): void {
    let tableMap = this.rows.get(table);
    if (!tableMap) {
      tableMap = new Map();
      this.rows.set(table, tableMap);
    }
    tableMap.set(String(row.id), normalize(row));
  }

  appendChange(table: SyncTable, rowId: string, updatedAt: string): void {
    this.seq += 1;
    this.changeLog.push({ seq: this.seq, table, rowId, updatedAt });
  }

  getChangeLog(table?: SyncTable, rowId?: string): ChangeLogEntry[] {
    return this.changeLog.filter(
      (entry) =>
        (table === undefined || entry.table === table) &&
        (rowId === undefined || entry.rowId === rowId),
    );
  }

  peekCommand(id: string): CommandRow | undefined {
    const command = this.commands.get(id);
    return command ? { ...command } : undefined;
  }

  setCommandLease(id: string, leaseUntil: string): void {
    const command = this.commands.get(id);
    if (command) this.commands.set(id, { ...command, leaseUntil });
  }
}

/** Volatile stand-in for the Supabase Storage `files` bucket. */
export class MemoryFileStore implements FileStore {
  private files = new Map<string, { bytes: ArrayBuffer; contentType: string }>();

  async head(sha: string): Promise<FileMeta | null> {
    const file = this.files.get(sha);
    return file ? { size: file.bytes.byteLength, contentType: file.contentType } : null;
  }

  async put(sha: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
    if (!this.files.has(sha)) this.files.set(sha, { bytes, contentType });
  }

  async get(sha: string, range?: ByteRange): Promise<FileObject | null> {
    const file = this.files.get(sha);
    if (!file) return null;
    if (!range) return { body: file.bytes };
    return { body: file.bytes.slice(range.start, range.end + 1) };
  }
}
