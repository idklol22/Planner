/** Plain-TS storage contracts for the Supabase hub.
 *
 * No Deno- or Cloudflare-only APIs live here: these are just the data shapes
 * the router depends on, so an in-memory implementation can be used in tests
 * and a Postgres/Storage implementation can be used in the Edge Function.
 */

export type SyncTable =
  | "category"
  | "task"
  | "goal"
  | "meal"
  | "h_subject"
  | "h_topic"
  | "h_material"
  | "h_deadline";

export type Note = {
  id?: string;
  taskId?: string;
  content?: string;
  images?: unknown[];
  handoff?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  order: number;
  linkedSubjectId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskRow {
  id: string;
  title: string;
  date: string;
  categoryId: string | null;
  parentId: string | null;
  seriesId: string | null;
  order: number;
  done: boolean;
  completedAt: string | null;
  time: string | null;
  durationMin: number | null;
  rrule: string | null;
  deadline: boolean;
  kind: string;
  note: Note | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GoalRow {
  id: string;
  period: "day" | "week";
  metric: string;
  target: number;
  scopeCategoryId: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MealRow {
  id: string;
  date: string;
  slot: string;
  label: string;
  kcal: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface HSubjectRow {
  id: string;
  name: string;
  color: string;
  order: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface HTopicRow {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface HMaterialRow {
  id: string;
  subjectId: string;
  topicId: string | null;
  fileName: string;
  title: string;
  kind: "pdf" | "text";
  sha256: string;
  pageCount: number;
  lecture: string | null;
  date: string | null;
  addedAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface HDeadlineRow {
  id: string;
  subjectId: string;
  topicId: string | null;
  title: string;
  due: string;
  kind: string;
  done: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export type SyncRow =
  | CategoryRow
  | TaskRow
  | GoalRow
  | MealRow
  | HSubjectRow
  | HTopicRow
  | HMaterialRow
  | HDeadlineRow;

export interface HubOp {
  table: SyncTable;
  row: SyncRow;
}

/** A device as seen by the authorizer (role defaults to "user" when null). */
export interface Device {
  id: string;
  role: string;
}

export interface SyncChange {
  table: SyncTable;
  row: SyncRow;
}

export interface UpsertResult {
  applied: number;
  cursor: number;
  /** The rows that were actually written (stale updates are excluded). */
  rows: SyncChange[];
}

export interface SyncResult {
  changes: SyncChange[];
  cursor: number;
  more: boolean;
}

export interface EventRow {
  id: string;
  type: string;
  source: string | null;
  origin: string | null;
  payload: unknown;
  ts: string;
  idempotencyKey: string;
}

export interface EventInput {
  id: string;
  type: string;
  source: string | null;
  origin: string | null;
  payload: unknown;
  ts: string;
  idempotencyKey: string;
}

export interface EventResult {
  id: string;
  deduplicated: boolean;
}

export interface EventsResult {
  events: EventRow[];
  cursor: number | string;
  more: boolean;
}

export type CommandStatus = "queued" | "claimed" | "done" | "failed";

export interface CommandRow {
  id: string;
  type: string;
  payload: unknown;
  status: CommandStatus;
  claimedBy: string | null;
  leaseUntil: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CommandInput {
  id: string;
  type: string;
  payload: unknown;
}

/** All persistence operations the router needs. */
export interface HubStore {
  findDeviceByTokenHash(hash: string): Promise<Device | null>;
  upsertRows(ops: HubOp[]): Promise<UpsertResult>;
  changesSince(seq: number, limit: number): Promise<SyncResult>;
  insertEvent(event: EventInput): Promise<EventResult>;
  eventsSince(since: number | string, limit: number): Promise<EventsResult>;
  enqueueCommand(command: CommandInput): Promise<{ id: string }>;
  getCommand(id: string): Promise<CommandRow | null>;
  claimCommand(device: string, leaseSec: number): Promise<CommandRow | null>;
  completeCommand(id: string, status: CommandStatus, result: unknown): Promise<CommandRow | null>;
  timedTasks(): Promise<TaskRow[]>;
}

export interface FileMeta {
  size: number;
  contentType: string;
}

/** Inclusive byte range, matching an HTTP `Range: bytes=start-end`. */
export interface ByteRange {
  start: number;
  end: number;
}

export interface FileObject {
  body: ArrayBuffer;
}

/** Blob storage operations the router needs (content-addressed by sha256). */
export interface FileStore {
  head(sha: string): Promise<FileMeta | null>;
  put(sha: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  get(sha: string, range?: ByteRange): Promise<FileObject | null>;
}

/** Non-secret environment the router reads. */
export interface HubConfig {
  CAL_SECRET: string;
  ALLOWED_ORIGINS?: string;
}
