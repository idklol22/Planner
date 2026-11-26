/** Planner/harness messages over the existing hub sync transport. No UI wiring:
 *  transport, storage, clock and id generation are all injectable. */

import type {
  HubClient,
  HubOp,
  HSubjectRow,
  MessageAttachment,
  MessageRow,
  MessageSender,
} from "../storage/hub";
import { isNewerRow } from "../sync/queue";

export type { MessageAttachment, MessageRow, MessageSender } from "../storage/hub";

export type MessageStatus = "queued" | "sent" | "received";
export interface ThreadMessage extends MessageRow {
  status: MessageStatus;
}

export type MessageTransport = Pick<HubClient, "push" | "pull" | "putFile" | "getFile">;

export interface MessageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MessageClientOptions {
  transport: MessageTransport;
  storage: MessageStorage;
  now?(): Date;
  id?(): string;
}

export interface NewMessageInput {
  text: string;
  subjectId?: string | null;
  topicId?: string | null;
  attachments?: MessageAttachment[];
  sender?: MessageSender;
}

export interface SendMessageInput {
  text: string;
  subjectId?: string | null;
  topicId?: string | null;
  files?: Array<{
    name: string;
    mime: string;
    bytes: Blob | ArrayBuffer;
    durationSec?: number;
  }>;
}

export const THREADS_KEY = "planner.messages.threads.v1";
export const OUTBOX_KEY = "planner.messages.outbox.v1";
export const CURSOR_KEY = "planner.messages.cursor.v1";

const BATCH_SIZE = 50;

function iso(now: Date | string | undefined): string {
  if (now === undefined) return new Date().toISOString();
  return typeof now === "string" ? now : now.toISOString();
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Build a local row. All timestamps are ISO UTC and createdAt === updatedAt. */
export function newMessage(
  input: NewMessageInput,
  opts: { id?: string; now?: Date | string } = {},
): MessageRow {
  const now = iso(opts.now);
  return {
    id: opts.id ?? crypto.randomUUID(),
    subjectId: input.subjectId ?? null,
    topicId: input.topicId ?? null,
    sender: input.sender ?? "planner",
    text: input.text,
    attachments: input.attachments ?? [],
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
    deletedAt: null,
  };
}

/** A row in the outbox is queued; otherwise delivery decides received vs sent. */
export function messageStatus(row: MessageRow, queued: boolean): MessageStatus {
  if (queued) return "queued";
  return row.deliveredAt !== null ? "received" : "sent";
}

function newerTimestamp(candidate: string, current: string | null): boolean {
  if (current === null) return true;
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  if (Number.isNaN(a) || Number.isNaN(b)) return candidate > current;
  return a > b;
}

function compareAscending(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Drop tombstones, keep the newest version of each id, sort, attach status. */
export function mergeThread(
  rows: readonly MessageRow[],
  queuedIds: ReadonlySet<string>,
): ThreadMessage[] {
  const byId = new Map<string, MessageRow>();
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const current = byId.get(row.id);
    if (isNewerRow(row, current)) byId.set(row.id, row);
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        compareAscending(a.createdAt, b.createdAt) || compareAscending(a.id, b.id),
    )
    .map((row) => ({
      ...row,
      status: messageStatus(row, queuedIds.has(row.id)),
    }));
}

/** Ack a delivered harness message with a strictly newer updatedAt so the hub
 *  applies it under last-write-wins. Never edits text or attachments. */
export function ackMessage(
  row: MessageRow,
  opts: { now?: Date | string } = {},
): MessageRow | null {
  if (row.deliveredAt !== null) return null;
  const deliveredAt = iso(opts.now);
  return {
    ...row,
    deliveredAt,
    updatedAt: new Date(
      Math.max(Date.parse(deliveredAt), Date.parse(row.updatedAt) + 1),
    ).toISOString(),
  };
}

/** Live mirrored subjects only; newestUpdatedAt is null when none is live. */
export function harnessLink(
  subjects: readonly HSubjectRow[],
): { exists: boolean; newestUpdatedAt: string | null } {
  let newestUpdatedAt: string | null = null;
  let exists = false;
  for (const subject of subjects) {
    if (subject.deletedAt != null) continue;
    exists = true;
    if (newerTimestamp(subject.updatedAt, newestUpdatedAt)) {
      newestUpdatedAt = subject.updatedAt;
    }
  }
  return { exists, newestUpdatedAt };
}

function isMessageRow(value: unknown): value is MessageRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MessageRow>;
  return (
    typeof row.id === "string" &&
    typeof row.createdAt === "string" &&
    typeof row.updatedAt === "string" &&
    typeof row.text === "string" &&
    (row.sender === "planner" || row.sender === "harness") &&
    Array.isArray(row.attachments)
  );
}

export class MessageClient {
  constructor(private readonly options: MessageClientOptions) {}

  /** Defaults to localStorage; resolved lazily so tests/native hosts can omit it. */
  private get store(): MessageStorage {
    return this.options.storage ?? localStorage;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private readRows(key: string): MessageRow[] {
    try {
      const raw = this.store.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isMessageRow) : [];
    } catch {
      return [];
    }
  }

  private writeRows(key: string, rows: MessageRow[]): void {
    try {
      if (rows.length === 0) this.store.removeItem(key);
      else this.store.setItem(key, JSON.stringify(rows));
    } catch {
      // Quota exceeded / private mode: keep going with in-memory state.
    }
  }

  private readCursor(): number {
    try {
      const raw = this.store.getItem(CURSOR_KEY);
      const value = raw === null ? 0 : Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private writeCursor(cursor: number): void {
    try {
      this.store.setItem(CURSOR_KEY, String(cursor));
    } catch {
      // Quota exceeded / private mode.
    }
  }

  private findRow(id: string): MessageRow | null {
    return this.readRows(THREADS_KEY).find((row) => row.id === id) ?? null;
  }

  private upsertRow(row: MessageRow): void {
    const rows = this.readRows(THREADS_KEY);
    const index = rows.findIndex((current) => current.id === row.id);
    if (index < 0) rows.push(row);
    else rows[index] = row;
    this.writeRows(THREADS_KEY, rows);
  }

  /** One pending row per message id, so retries never duplicate an op. */
  private enqueue(row: MessageRow): void {
    const rows = this.readRows(OUTBOX_KEY);
    const index = rows.findIndex((current) => current.id === row.id);
    if (index < 0) rows.push(row);
    else rows[index] = row;
    this.writeRows(OUTBOX_KEY, rows);
  }

  /** Upload every file first: a failed upload must store no row and no op. */
  async send(input: SendMessageInput): Promise<MessageRow> {
    const attachments: MessageAttachment[] = [];
    for (const file of input.files ?? []) {
      const body: ArrayBuffer | Uint8Array =
        file.bytes instanceof Blob ? await file.bytes.arrayBuffer() : file.bytes;
      const sha256 = await sha256Hex(body);
      await this.options.transport.putFile(sha256, file.bytes, file.mime);
      attachments.push({
        sha256,
        name: file.name,
        mime: file.mime,
        bytes: body.byteLength,
        ...(file.durationSec === undefined ? {} : { durationSec: file.durationSec }),
      });
    }

    const row = newMessage(
      {
        text: input.text,
        subjectId: input.subjectId,
        topicId: input.topicId,
        attachments,
      },
      { id: this.options.id?.() ?? crypto.randomUUID(), now: this.now() },
    );
    this.upsertRow(row);
    this.enqueue(row);
    await this.flush();
    return row;
  }

  /** Push the outbox in batches of 50. Failed batches stay queued; the same id
   *  is retried instead of being duplicated. Resolves with the ack count. */
  async flush(): Promise<number> {
    let acked = 0;
    for (;;) {
      const pending = this.readRows(OUTBOX_KEY);
      if (pending.length === 0) break;
      const batch = pending.slice(0, BATCH_SIZE);
      const ops: HubOp[] = batch.map((row) => ({ table: "message", row }));
      try {
        await this.options.transport.push(ops);
      } catch {
        break;
      }
      const sent = new Set(batch.map((row) => row.id));
      this.writeRows(
        OUTBOX_KEY,
        this.readRows(OUTBOX_KEY).filter((row) => !sent.has(row.id)),
      );
      acked += batch.length;
    }
    return acked;
  }

  /** Walk /sync with this client's own cursor, store only message rows, ack
   *  undelivered harness messages, then flush the acks. */
  async pull(): Promise<ThreadMessage[]> {
    let cursor = this.readCursor();
    for (;;) {
      const previous = cursor;
      const page = await this.options.transport.pull(cursor);
      for (const change of page.changes) {
        if (change.table !== "message" || !isMessageRow(change.row)) continue;
        const incoming = change.row;
        const current = this.findRow(incoming.id);
        const stored = isNewerRow(incoming, current) ? incoming : current;
        if (stored === incoming) this.upsertRow(incoming);
        if (stored && stored.sender === "harness" && stored.deliveredAt === null) {
          const ack = ackMessage(stored, { now: this.now() });
          if (ack) {
            // Reflect the local ack now; its newer updatedAt also prevents a
            // re-pull of the undelivered row from creating a second ack.
            this.upsertRow(ack);
            this.enqueue(ack);
          }
        }
      }
      if (page.cursor > previous) cursor = page.cursor;
      this.writeCursor(cursor);
      // A non-advancing cursor with `more` set would loop forever.
      if (!page.more || page.cursor <= previous) break;
    }
    await this.flush();
    return this.thread();
  }

  thread(): ThreadMessage[] {
    const queuedIds = new Set(this.readRows(OUTBOX_KEY).map((row) => row.id));
    return mergeThread(this.readRows(THREADS_KEY), queuedIds);
  }

  getAttachment(sha256: string): Promise<Blob> {
    return this.options.transport.getFile(sha256);
  }
}
