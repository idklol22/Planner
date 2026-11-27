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
  | "message"
  | "health"
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

export type MessageAttachment = {
  sha256: string;
  name: string;
  mime: string;
  bytes: number;
  durationSec?: number;
};

export interface MessageRow {
  id: string;
  subjectId: string | null;
  topicId: string | null;
  sender: "planner" | "harness";
  text: string;
  attachments: MessageAttachment[];
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  deletedAt: string | null;
}

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
  archivedAt?: string | null;
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
  /** Grams of protein; null/absent when the row predates the column. */
  protein?: number | null;
  updatedAt: string;
  deletedAt: string | null;
  createdAt?: string | null;
}

export interface HealthWorkout {
  type: string;
  minutes: number;
  kcal: number | null;
}

/** One local day of Health data (sync table `health`). */
export interface HealthRow {
  id: string;
  date: string;
  activeKcal: number | null;
  steps: number | null;
  exerciseMin: number | null;
  distanceKm: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  workouts: HealthWorkout[];
  source: "healthkit" | "shortcut" | null;
  updatedAt: string;
  deletedAt: string | null;
}

/** The single `default` row of `widget_profile`. */
export interface WidgetProfile {
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
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
  | MessageRow
  | HealthRow
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

  /** Read a single sync row (used by widget actions and the health view). */
  getSyncRow(table: SyncTable, id: string): Promise<SyncRow | null>;
  /** Considered task rows for a widget day (not deleted/archived, open or future).
   * Implementations page through the database; the caller caps the result. */
  listWidgetTasks(date: string): Promise<TaskRow[]>;
  listWidgetCategories(): Promise<CategoryRow[]>;
  listWidgetMeals(date: string): Promise<MealRow[]>;
  getWidgetProfile(): Promise<WidgetProfile | null>;
  putWidgetProfile(data: Record<string, unknown>): Promise<void>;
  /** Revoke all earlier widget devices and register one holding `tokenHash`. */
  replaceWidgetDevice(tokenHash: string): Promise<void>;
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
