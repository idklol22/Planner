/** Typed client for the Planner hub Worker. No UI wiring: callers own when to
 *  push/pull. Row shapes mirror docs/PLANNER-DESIGN.md (camelCase on the wire). */

export type SyncTable = "category" | "task" | "goal" | "meal";

export interface Note {
  id?: string;
  taskId?: string;
  content?: string;
  images?: unknown[];
  handoff?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
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
  kind: "general" | "class" | "study" | "revisit" | "practice" | "research" | "meeting";
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

export type SyncRow = CategoryRow | TaskRow | GoalRow | MealRow;

export interface HubOp {
  table: SyncTable;
  row: SyncRow;
}

export interface PushResult {
  applied: number;
  cursor: number;
}

export interface PullResult {
  changes: Array<{ table: SyncTable; row: SyncRow }>;
  cursor: number;
  more: boolean;
}

export interface NewEvent {
  id?: string;
  type: string;
  source?: string;
  origin?: string;
  payload?: unknown;
  ts?: string;
  idempotencyKey?: string;
}

export interface EventRecord {
  id: string;
  type: string;
  source: string | null;
  origin: string | null;
  payload: unknown;
  ts: string;
  idempotencyKey: string;
}

export class HubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HubError";
  }
}

export class HubClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init?.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.base}${path}`, { ...init, headers });
    const text = await response.text();
    if (!response.ok) {
      throw new HubError(text || `hub returned ${response.status}`, response.status);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Upsert rows; the hub ignores updates older than what it already has. */
  push(ops: HubOp[]): Promise<PushResult> {
    return this.request<PushResult>("/ops", {
      method: "POST",
      body: JSON.stringify({ ops }),
    });
  }

  /** Fetch at most 500 changes after `since`. Resume with the returned cursor. */
  pull(since = 0): Promise<PullResult> {
    return this.request<PullResult>(`/sync?since=${encodeURIComponent(String(since))}`);
  }

  /** Post an event; repeat the same idempotencyKey to deduplicate. */
  postEvent(event: NewEvent): Promise<{ id: string; deduplicated: boolean }> {
    return this.request<{ id: string; deduplicated: boolean }>("/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }
}
