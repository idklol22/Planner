/** Typed client for the Planner hub Worker. No UI wiring: callers own when to
 *  push/pull. Row shapes mirror docs/PLANNER-DESIGN.md (camelCase on the wire). */

/** Keepalive requests must stay well below the browser's per-request cap. */
const KEEPALIVE_MAX_BYTES = 60_000;

export type SyncTable = "category" | "task" | "goal" | "meal" | "health";

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
  /** Archive tombstone; null = live. */
  archivedAt: string | null;
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One workout inside a health row (Apple Shortcut / HealthKit). */
export interface HealthWorkout {
  type: string;
  minutes: number;
  kcal: number | null;
}

/** Per-day Apple Health numbers. `id` is always `health_<date>`. */
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
  source: "healthkit" | "shortcut";
  updatedAt: string;
  deletedAt: string | null;
}

/** Body of PUT /widget/profile. The widget reads categories/goals from here. */
export interface WidgetProfile {
  calorieGoal: number;
  theme: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    faint: string;
    accent: string;
    accentContrast: string;
    dark: boolean;
  };
  goals: Array<{
    id: string;
    categoryId: string;
    title: string;
    done: boolean;
    order: number;
  }>;
}

export type SyncRow = CategoryRow | TaskRow | GoalRow | MealRow | HealthRow;

/** Read-only tables mirrored from LearnHarness; pulled but never pushed. */
export type MirrorTable = "h_subject" | "h_topic" | "h_material" | "h_deadline";
export type PullTable = SyncTable | MirrorTable;

export interface HSubjectRow {
  id: string;
  name: string;
  color: string;
  order: number;
  updatedAt: string;
  deletedAt?: string | null;
}
export interface HTopicRow {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  updatedAt: string;
  deletedAt?: string | null;
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
  deletedAt?: string | null;
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
  deletedAt?: string | null;
}
export type MirrorRow = HSubjectRow | HTopicRow | HMaterialRow | HDeadlineRow;
export type PullRow = SyncRow | MirrorRow;

export function isMirrorTable(table: string): table is MirrorTable {
  return table.startsWith("h_");
}

export type CommandStatus = "queued" | "claimed" | "done" | "failed";
export interface CommandRecord {
  id: string;
  type: string;
  payload: unknown;
  status: CommandStatus;
  result: unknown;
}

export interface HubOp {
  table: SyncTable;
  row: SyncRow;
}

export interface PushResult {
  applied: number;
  cursor: number;
}

export interface PullResult {
  changes: Array<{ table: PullTable; row: PullRow }>;
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

  /** Best-effort push for unload / tab-hide. Fire-and-forget: a response cannot
   *  be awaited during unload, so callers must leave the ops in the outbox.
   *  Returns false when the request cannot be sent (no browser, no fetch, or
   *  a body that is too large). */
  pushKeepalive(ops: HubOp[]): boolean {
    const body = JSON.stringify({ ops });
    if (
      typeof navigator === "undefined" ||
      typeof fetch === "undefined" ||
      body.length > KEEPALIVE_MAX_BYTES
    ) {
      return false;
    }
    void fetch(`${this.base}/ops`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  }

  /** Fetch at most 500 changes after `since`. Resume with the returned cursor. */
  pull(since = 0): Promise<PullResult> {
    return this.request<PullResult>(`/sync?since=${encodeURIComponent(String(since))}`);
  }

  /** Issue a new widget token. Revokes every earlier widget device. */
  async createWidgetToken(): Promise<string> {
    const result = await this.request<{ token?: unknown }>("/widget/token", { method: "POST" });
    if (typeof result?.token !== "string" || !result.token) {
      throw new HubError("hub did not return a widget token", 502);
    }
    return result.token;
  }

  /** Replace the single widget profile row. */
  async putWidgetProfile(profile: WidgetProfile): Promise<void> {
    await this.request("/widget/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }

  /** Post an event; repeat the same idempotencyKey to deduplicate. */
  postEvent(event: NewEvent): Promise<{ id: string; deduplicated: boolean }> {
    return this.request<{ id: string; deduplicated: boolean }>("/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  /** Events after `since` (a rowid cursor, or an ISO timestamp for old data). */
  getEvents(since: number | string = 0): Promise<{
    events: EventRecord[];
    cursor: number | string;
    more?: boolean;
  }> {
    return this.request(`/events?since=${encodeURIComponent(String(since))}`);
  }

  /** Queue a command for the laptop agent (for example `harness.note`). */
  postCommand(type: string, payload: unknown, id?: string): Promise<{ id: string }> {
    return this.request<{ id: string }>("/commands", {
      method: "POST",
      body: JSON.stringify({ type, payload, ...(id ? { id } : {}) }),
    });
  }

  /** Current state of a command; null when the hub has no such route/command. */
  async getCommand(id: string): Promise<CommandRecord | null> {
    try {
      const out = await this.request<{ command: CommandRecord | null }>(
        `/commands/${encodeURIComponent(id)}`,
      );
      return out?.command ?? null;
    } catch (error) {
      if (error instanceof HubError && (error.status === 404 || error.status === 405)) return null;
      throw error;
    }
  }

  /** Upload message/file bytes under their SHA-256. Uses a plain fetch so the
   *  body keeps its binary Content-Type instead of request()'s JSON header. */
  async putFile(
    sha256: string,
    bytes: Blob | ArrayBuffer | Uint8Array,
    mime: string,
  ): Promise<{ sha256: string; bytes: number }> {
    const data = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes;
    const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
    const actual = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== sha256) {
      throw new HubError(`file sha256 mismatch: expected ${sha256}, got ${actual}`, 400);
    }
    const response = await fetch(`${this.base}/files/${sha256}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": mime },
      body: data as BodyInit,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new HubError(text || `file upload returned ${response.status}`, response.status);
    }
    return { sha256, bytes: data.byteLength };
  }

  /** Download a stored file (PDF) with the bearer token. */
  async getFile(sha256: string): Promise<Blob> {
    const response = await fetch(`${this.base}/files/${encodeURIComponent(sha256)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new HubError(`file ${response.status}`, response.status);
    return response.blob();
  }

  /** Cheap authenticated probe for "Test connection". */
  async ping(): Promise<void> {
    await this.pull(Number.MAX_SAFE_INTEGER);
  }
}
