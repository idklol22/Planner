/** Persistent outbox for hub operations. The stored wire format stays a plain
 *  `{ table, row }[]`; rows are merged per table + id so only the newest
 *  `updatedAt` survives. */

import type { HubOp, PullRow } from "../storage/hub";

export const OUTBOX_KEY = "planner.outbox.v1";

const TABLES: readonly string[] = ["category", "task", "goal", "meal"];

export interface OutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Outbox {
  enqueue(op: HubOp): void;
  enqueueAll(ops: HubOp[]): void;
  /** The first `limit` pending ops, in insertion order. */
  pending(limit?: number): HubOp[];
  /** Drop the exact ops that were sent; newer replacements stay queued. */
  ack(sent: HubOp[]): void;
  size(): number;
  clear(): void;
}

export function opKey(op: HubOp): string {
  return `${op.table}:${op.row.id}`;
}

/** Strictly newer wins; equal timestamps keep the version already queued. */
export function isNewerRow(
  candidate: PullRow,
  current: PullRow | null | undefined,
): boolean {
  if (!current) return true;
  const a = Date.parse(candidate.updatedAt);
  const b = Date.parse(current.updatedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return candidate.updatedAt > current.updatedAt;
  }
  return a > b;
}

function isHubOp(value: unknown): value is HubOp {
  if (!value || typeof value !== "object") return false;
  const op = value as { table?: unknown; row?: unknown };
  if (typeof op.table !== "string" || !TABLES.includes(op.table)) return false;
  if (!op.row || typeof op.row !== "object") return false;
  const row = op.row as { id?: unknown; updatedAt?: unknown };
  return typeof row.id === "string" && typeof row.updatedAt === "string";
}

export class LocalOutbox implements Outbox {
  /** Defaults to the browser localStorage; injectable for tests/native hosts. */
  constructor(private readonly storage?: OutboxStorage) {}

  private get store(): OutboxStorage {
    return this.storage ?? localStorage;
  }

  private read(): HubOp[] {
    const raw = this.store.getItem(OUTBOX_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isHubOp) : [];
    } catch {
      return [];
    }
  }

  private write(ops: HubOp[]): void {
    if (ops.length === 0) this.store.removeItem(OUTBOX_KEY);
    else this.store.setItem(OUTBOX_KEY, JSON.stringify(ops));
  }

  enqueue(op: HubOp): void {
    this.enqueueAll([op]);
  }

  enqueueAll(ops: HubOp[]): void {
    const merged = new Map<string, HubOp>();
    for (const existing of this.read()) merged.set(opKey(existing), existing);
    for (const incoming of ops) {
      const key = opKey(incoming);
      const current = merged.get(key);
      if (isNewerRow(incoming.row, current?.row)) merged.set(key, incoming);
    }
    this.write([...merged.values()]);
  }

  pending(limit = Number.POSITIVE_INFINITY): HubOp[] {
    const ops = this.read();
    return limit >= ops.length ? ops : ops.slice(0, Math.max(0, limit));
  }

  ack(sent: HubOp[]): void {
    if (sent.length === 0) return;
    const byKey = new Map<string, string>();
    for (const op of sent) byKey.set(opKey(op), JSON.stringify(op));
    const remaining = this.read().filter(
      (op) => byKey.get(opKey(op)) !== JSON.stringify(op),
    );
    this.write(remaining);
  }

  size(): number {
    return this.read().length;
  }

  clear(): void {
    this.write([]);
  }
}
