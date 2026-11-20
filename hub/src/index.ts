/** Planner hub: a single Cloudflare Worker backed by D1.
 *
 * JSON rows use the app's camelCase shapes; the D1 columns are snake_case.
 * All state-changing endpoints (except the calendar feed) require a device token.
 */

export interface HubEnv {
  DB: D1Database;
  FILES: R2Bucket;
  CAL_SECRET: string;
  ALLOWED_ORIGINS?: string;
}

declare global {
  namespace Cloudflare {
    interface Env extends HubEnv {}
  }
}

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

export interface EventRow {
  id: string;
  type: string;
  source: string | null;
  origin: string | null;
  payload: unknown;
  ts: string;
  idempotencyKey: string;
}

export interface CommandRow {
  id: string;
  type: string;
  payload: unknown;
  status: "queued" | "claimed" | "done" | "failed";
  claimedBy: string | null;
  leaseUntil: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
}

const SYNC_TABLES: SyncTable[] = [
  "category",
  "task",
  "goal",
  "meal",
  "h_subject",
  "h_topic",
  "h_material",
  "h_deadline",
];
const PAGE_SIZE = 500;
const LEASE_MS = 5 * 60 * 1000;

type FieldKind = "text" | "int" | "real" | "bool" | "json";
interface Field {
  key: string;
  column: string;
  kind: FieldKind;
}

const FIELDS: Record<SyncTable, Field[]> = {
  category: [
    { key: "id", column: "id", kind: "text" },
    { key: "name", column: "name", kind: "text" },
    { key: "color", column: "color", kind: "text" },
    { key: "icon", column: "icon", kind: "text" },
    { key: "order", column: "order", kind: "int" },
    { key: "linkedSubjectId", column: "linked_subject_id", kind: "text" },
    { key: "archived", column: "archived", kind: "bool" },
    { key: "createdAt", column: "created_at", kind: "text" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  task: [
    { key: "id", column: "id", kind: "text" },
    { key: "title", column: "title", kind: "text" },
    { key: "date", column: "date", kind: "text" },
    { key: "categoryId", column: "category_id", kind: "text" },
    { key: "parentId", column: "parent_id", kind: "text" },
    { key: "seriesId", column: "series_id", kind: "text" },
    { key: "order", column: "order", kind: "int" },
    { key: "done", column: "done", kind: "bool" },
    { key: "completedAt", column: "completed_at", kind: "text" },
    { key: "time", column: "time", kind: "text" },
    { key: "durationMin", column: "duration_min", kind: "int" },
    { key: "rrule", column: "rrule", kind: "text" },
    { key: "deadline", column: "deadline", kind: "bool" },
    { key: "kind", column: "kind", kind: "text" },
    { key: "note", column: "note_json", kind: "json" },
    { key: "createdAt", column: "created_at", kind: "text" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  goal: [
    { key: "id", column: "id", kind: "text" },
    { key: "period", column: "period", kind: "text" },
    { key: "metric", column: "metric", kind: "text" },
    { key: "target", column: "target", kind: "real" },
    { key: "scopeCategoryId", column: "scope_category_id", kind: "text" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  meal: [
    { key: "id", column: "id", kind: "text" },
    { key: "date", column: "date", kind: "text" },
    { key: "slot", column: "slot", kind: "text" },
    { key: "label", column: "label", kind: "text" },
    { key: "kcal", column: "kcal", kind: "real" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  h_subject: [
    { key: "id", column: "id", kind: "text" },
    { key: "name", column: "name", kind: "text" },
    { key: "color", column: "color", kind: "text" },
    { key: "order", column: "order", kind: "int" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  h_topic: [
    { key: "id", column: "id", kind: "text" },
    { key: "subjectId", column: "subject_id", kind: "text" },
    { key: "name", column: "name", kind: "text" },
    { key: "order", column: "order", kind: "int" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  h_material: [
    { key: "id", column: "id", kind: "text" },
    { key: "subjectId", column: "subject_id", kind: "text" },
    { key: "topicId", column: "topic_id", kind: "text" },
    { key: "fileName", column: "file_name", kind: "text" },
    { key: "title", column: "title", kind: "text" },
    { key: "kind", column: "kind", kind: "text" },
    { key: "sha256", column: "sha256", kind: "text" },
    { key: "pageCount", column: "page_count", kind: "int" },
    { key: "lecture", column: "lecture", kind: "text" },
    { key: "date", column: "date", kind: "text" },
    { key: "addedAt", column: "added_at", kind: "text" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
  h_deadline: [
    { key: "id", column: "id", kind: "text" },
    { key: "subjectId", column: "subject_id", kind: "text" },
    { key: "topicId", column: "topic_id", kind: "text" },
    { key: "title", column: "title", kind: "text" },
    { key: "due", column: "due", kind: "text" },
    { key: "kind", column: "kind", kind: "text" },
    { key: "done", column: "done", kind: "bool" },
    { key: "updatedAt", column: "updated_at", kind: "text" },
    { key: "deletedAt", column: "deleted_at", kind: "text" },
  ],
};

// ── Small helpers ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSyncTable(value: unknown): value is SyncTable {
  return typeof value === "string" && SYNC_TABLES.includes(value as SyncTable);
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Accept both camelCase (app) and snake_case (raw D1) input keys. */
function normalize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(row)) {
    const camel = snakeToCamel(key);
    if (camel !== key && !(camel in out)) out[camel] = value;
  }
  if (out.note === undefined && out.noteJson !== undefined) out.note = out.noteJson;
  return out;
}

function toDbValue(value: unknown, kind: FieldKind): string | number | null {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case "bool":
      return value === true || value === 1 || value === "1" ? 1 : 0;
    case "int":
      return Number(value);
    case "real":
      return Number(value);
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    case "text":
      return String(value);
  }
}

function fromDbValue(value: unknown, kind: FieldKind): unknown {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case "bool":
      return value === 1 || value === true;
    case "int":
    case "real":
      return Number(value);
    case "json": {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    case "text":
      return value;
  }
}

function toDbRow(table: SyncTable, raw: Record<string, unknown>): Record<string, string | number | null> {
  const row = normalize(raw);
  const out: Record<string, string | number | null> = {};
  for (const field of FIELDS[table]) {
    let value = row[field.key];
    // Sensible defaults for optional columns; required columns still rely on the schema.
    if (value === undefined) {
      if (field.kind === "bool") value = 0;
      else if (field.kind === "int" || field.kind === "real") value = 0;
      else value = null;
    }
    out[field.column] = toDbValue(value, field.kind);
  }
  return out;
}

function fromDbRow<T>(table: SyncTable, db: Record<string, unknown>): T {
  const row: Record<string, unknown> = {};
  for (const field of FIELDS[table]) {
    row[field.key] = fromDbValue(db[field.column], field.kind);
  }
  return row as T;
}

function quoted(column: string): string {
  return `"${column}"`;
}

function compareUpdatedAt(a: unknown, b: unknown): number {
  const left = String(a);
  const right = String(b);
  const aMs = Date.parse(left);
  const bMs = Date.parse(right);
  if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) return aMs - bMs;
  return left < right ? -1 : left > right ? 1 : 0;
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("invalid JSON body", 400);
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function digestHex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  return digestHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  return digestHex(await crypto.subtle.digest("SHA-256", bytes));
}

function corsHeaders(request: Request, env: HubEnv): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(response: Response, cors: Headers): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of cors) {
    if (name !== "vary" || !headers.has("Vary")) headers.set(name, value);
    else headers.set("Vary", `${headers.get("Vary")}, ${value}`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

interface AuthResult {
  denied: Response | null;
  role: string | null;
}

async function authorize(request: Request, env: HubEnv): Promise<AuthResult> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return { denied: error("missing bearer token", 401), role: null };
  const hash = await sha256Hex(match[1].trim());
  const device = await env.DB.prepare("SELECT id, role FROM device WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(hash)
    .first<{ id: string; role: string | null }>();
  if (!device) return { denied: error("unauthorized", 401), role: null };
  return { denied: null, role: device.role ?? "user" };
}

// ── Endpoints ───────────────────────────────────────────────────────────────

async function handleOps(request: Request, env: HubEnv, role: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!isRecord(body) || !Array.isArray(body.ops)) throw new HttpError("expected { ops: [...] }", 400);

  // Check the whole batch before writing anything: h_* rows are harness-only.
  if (
    role !== "harness" &&
    body.ops.some(
      (op) => isRecord(op) && typeof op.table === "string" && op.table.startsWith("h_"),
    )
  ) {
    throw new HttpError("harness role required for h_* tables", 403);
  }

  let applied = 0;
  for (const op of body.ops) {
    if (!isRecord(op) || !isSyncTable(op.table) || !isRecord(op.row)) {
      throw new HttpError("each op needs a supported table and a row", 400);
    }
    const table = op.table;
    const row = normalize(op.row);
    const id = row.id;
    const updatedAt = row.updatedAt;
    if (typeof id !== "string" || !id || typeof updatedAt !== "string" || !updatedAt) {
      throw new HttpError("row needs id and updatedAt", 400);
    }

    const existing = await env.DB.prepare(`SELECT updated_at FROM ${quoted(table)} WHERE id = ?`)
      .bind(id)
      .first<{ updated_at: string }>();
    if (existing && compareUpdatedAt(updatedAt, existing.updated_at) < 0) continue;

    const dbRow = toDbRow(table, op.row);
    const columns = FIELDS[table].map((field) => quoted(field.column));
    const values = FIELDS[table].map((field) => dbRow[field.column]);
    const assignments = columns
      .filter((column) => column !== quoted("id"))
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");
    await env.DB.prepare(
      `INSERT INTO ${quoted(table)} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ` +
        `ON CONFLICT(id) DO UPDATE SET ${assignments}`,
    )
      .bind(...values)
      .run();
    await env.DB.prepare("INSERT INTO change_log (table_name, row_id, updated_at) VALUES (?, ?, ?)")
      .bind(table, id, updatedAt)
      .run();
    applied += 1;
  }

  const cursorRow = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM change_log").first<{ seq: number }>();
  return json({ applied, cursor: Number(cursorRow?.seq ?? 0) });
}

async function handleSync(request: Request, env: HubEnv): Promise<Response> {
  const rawSince = request.url.includes("?") ? new URL(request.url).searchParams.get("since") : null;
  const since = Math.max(0, Number.parseInt(rawSince ?? "0", 10) || 0);
  const result = await env.DB.prepare(
    "SELECT seq, table_name, row_id FROM change_log WHERE seq > ? ORDER BY seq ASC LIMIT ?",
  )
    .bind(since, PAGE_SIZE + 1)
    .all<{ seq: number; table_name: SyncTable; row_id: string }>();

  const rows = result.results;
  const more = rows.length > PAGE_SIZE;
  const page = more ? rows.slice(0, PAGE_SIZE) : rows;
  const changes: Array<{ table: SyncTable; row: SyncRow }> = [];
  for (const change of page) {
    if (!isSyncTable(change.table_name)) continue;
    const stored = await env.DB.prepare(`SELECT * FROM ${quoted(change.table_name)} WHERE id = ?`)
      .bind(change.row_id)
      .first();
    if (!stored) continue;
    changes.push({
      table: change.table_name,
      row: fromDbRow<SyncRow>(change.table_name, stored),
    });
  }
  const cursor = page.length ? Number(page[page.length - 1].seq) : since;
  return json({ changes, cursor, more });
}

function parsePayload(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function payloadToJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function handlePostEvent(request: Request, env: HubEnv): Promise<Response> {
  const raw = await readJson(request);
  if (!isRecord(raw) || typeof raw.type !== "string" || !raw.type) {
    throw new HttpError("event needs a type", 400);
  }
  const body = normalize(raw);
  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey
      ? body.idempotencyKey
      : crypto.randomUUID();
  const ts = typeof body.ts === "string" && body.ts ? body.ts : new Date().toISOString();

  const existing = await env.DB.prepare("SELECT id FROM event WHERE idempotency_key = ?")
    .bind(idempotencyKey)
    .first<{ id: string }>();
  if (existing) return json({ id: existing.id, deduplicated: true });

  await env.DB.prepare(
    `INSERT INTO event (id, type, source, origin, payload_json, ts, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.type,
      typeof body.source === "string" ? body.source : null,
      typeof body.origin === "string" ? body.origin : null,
      payloadToJson(body.payload),
      ts,
      idempotencyKey,
    )
    .run();
  return json({ id, deduplicated: false }, 201);
}

async function handleGetEvents(request: Request, env: HubEnv): Promise<Response> {
  const rawSince = new URL(request.url).searchParams.get("since") ?? "0";
  const numeric = /^\d+$/.test(rawSince);
  const bindValue: string | number = numeric ? Number(rawSince) : rawSince;
  const where = numeric ? "rowid > ?" : "ts > ?";
  const result = await env.DB.prepare(
    `SELECT rowid AS seq, id, type, source, origin, payload_json, ts, idempotency_key
     FROM event WHERE ${where} ORDER BY rowid ASC LIMIT ?`,
  )
    .bind(bindValue, PAGE_SIZE + 1)
    .all<Record<string, unknown>>();

  const rows = result.results;
  const more = rows.length > PAGE_SIZE;
  const page = more ? rows.slice(0, PAGE_SIZE) : rows;
  const events: EventRow[] = page.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    source: row.source === null ? null : String(row.source),
    origin: row.origin === null ? null : String(row.origin),
    payload: parsePayload(row.payload_json),
    ts: String(row.ts),
    idempotencyKey: String(row.idempotency_key),
  }));
  const cursor = page.length ? Number(page[page.length - 1].seq) : numeric ? Number(rawSince) : rawSince;
  return json({ events, cursor, more });
}

function mapCommand(row: Record<string, unknown>): CommandRow {
  return {
    id: String(row.id),
    type: String(row.type),
    payload: parsePayload(row.payload_json),
    status: String(row.status) as CommandRow["status"],
    claimedBy: row.claimed_by === null ? null : String(row.claimed_by),
    leaseUntil: row.lease_until === null ? null : String(row.lease_until),
    result: parsePayload(row.result_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function handlePostCommand(request: Request, env: HubEnv): Promise<Response> {
  const raw = await readJson(request);
  if (!isRecord(raw) || typeof raw.type !== "string" || !raw.type) {
    throw new HttpError("command needs a type", 400);
  }
  const body = normalize(raw);
  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO command (id, type, payload_json, status, claimed_by, lease_until, result_json, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', NULL, NULL, NULL, ?, ?)`,
  )
    .bind(id, body.type, payloadToJson(body.payload), now, now)
    .run();
  return json({ id }, 201);
}

async function handleClaimCommand(request: Request, env: HubEnv): Promise<Response> {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.device !== "string" || !body.device) {
    throw new HttpError("claim needs a device", 400);
  }
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  // One statement: concurrent claimers cannot both claim the same command.
  const claimed = await env.DB.prepare(
    `UPDATE command
     SET status = 'claimed', claimed_by = ?, lease_until = ?, updated_at = ?
     WHERE id = (
       SELECT id FROM command
       WHERE status = 'queued' OR (status = 'claimed' AND lease_until IS NOT NULL AND lease_until <= ?)
       ORDER BY created_at ASC, rowid ASC
       LIMIT 1
     )
     RETURNING *`,
  )
    .bind(body.device, leaseUntil, now, now)
    .first();
  return json({ command: claimed ? mapCommand(claimed) : null });
}

async function handleCompleteCommand(request: Request, env: HubEnv, id: string): Promise<Response> {
  const raw = await readJson(request);
  if (!isRecord(raw)) throw new HttpError("expected a JSON object", 400);
  const body = normalize(raw);
  const status = body.status;
  if (status !== "done" && status !== "failed") {
    throw new HttpError("status must be done or failed", 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM command WHERE id = ?").bind(id).first();
  if (!existing) return error("command not found", 404);
  await env.DB.prepare(
    `UPDATE command SET status = ?, result_json = ?, lease_until = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(status, payloadToJson(body.result), new Date().toISOString(), id)
    .run();
  const row = await env.DB.prepare("SELECT * FROM command WHERE id = ?").bind(id).first();
  return json({ ok: true, command: row ? mapCommand(row) : null });
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsRule(rrule: string): string {
  const rule = rrule.trim();
  if (/^FREQ=/i.test(rule)) return rule;
  switch (rule) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    default: {
      const match = /^days:(\d+(?:,\d+)*)$/.exec(rule);
      if (!match) return "";
      const names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      const days = match[1]
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        .map((n) => names[n]);
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : "";
    }
  }
}

function icsDateTime(date: string, time: string): string {
  const day = date.replace(/-/g, "");
  const digits = time.replace(/\D/g, "");
  const clock = digits.length >= 6 ? digits.slice(0, 6) : `${digits.slice(0, 4).padEnd(4, "0")}00`;
  return `${day}T${clock}`;
}

function addMinutes(icsStamp: string, minutes: number): string {
  const year = Number(icsStamp.slice(0, 4));
  const month = Number(icsStamp.slice(4, 6));
  const day = Number(icsStamp.slice(6, 8));
  const hour = Number(icsStamp.slice(9, 11));
  const minute = Number(icsStamp.slice(11, 13));
  const second = Number(icsStamp.slice(13, 15));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes, second));
  // Floating local time to match DTSTART (which is also emitted without a zone).
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
}

async function handleIcs(request: Request, env: HubEnv): Promise<Response> {
  const match = /^\/cal\/([^/]+)\.ics$/.exec(new URL(request.url).pathname);
  let secret: string | null = null;
  if (match) {
    try {
      secret = decodeURIComponent(match[1]);
    } catch {
      secret = null;
    }
  }
  if (!secret || !env.CAL_SECRET || secret !== env.CAL_SECRET) {
    return error("calendar not found", 404);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM task
     WHERE time IS NOT NULL AND time != '' AND deleted_at IS NULL
     ORDER BY date ASC, "order" ASC, id ASC`,
  ).all();
  const nowStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planner//Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const row of result.results) {
    const task = fromDbRow<TaskRow>("task", row);
    const start = icsDateTime(task.date, task.time ?? "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(task.id)}@planner-hub`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${start}`,
    );
    if (task.durationMin && task.durationMin > 0) {
      lines.push(`DTEND:${addMinutes(start, task.durationMin)}`);
    }
    lines.push(`SUMMARY:${escapeIcs(task.title)}`);
    if (task.rrule) {
      const rule = toIcsRule(task.rrule);
      if (rule) lines.push(`RRULE:${rule}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

// ── Files (R2) ──────────────────────────────────────────────────────────────

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function fileKey(sha: string): string {
  return `files/${sha.toLowerCase()}`;
}

type ParsedRange = { start: number; end: number } | null | "invalid";

/** Convert a single `Range: bytes=…` header into an inclusive byte range. */
function parseRange(header: string | null, size: number): ParsedRange {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (match[2] === "") {
    const start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start >= size) return "invalid";
    return { start, end: size - 1 };
  }
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return "invalid";
  const clampedEnd = Math.min(end, size - 1);
  if (start > clampedEnd || start >= size) return "invalid";
  return { start, end: clampedEnd };
}

function fileHeaders(object: R2Object): Headers {
  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType;
  headers.set("Content-Type", contentType || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  if (object.httpMetadata?.cacheControl) {
    headers.set("Cache-Control", object.httpMetadata.cacheControl);
  }
  return headers;
}

async function handlePutFile(request: Request, env: HubEnv, sha: string): Promise<Response> {
  const normalized = sha.toLowerCase();
  if (!isSha256(normalized)) throw new HttpError("invalid sha256", 400);
  const bytes = await request.arrayBuffer();
  if ((await sha256Bytes(bytes)) !== normalized) throw new HttpError("sha256 mismatch", 400);

  const key = fileKey(normalized);
  if (!(await env.FILES.head(key))) {
    await env.FILES.put(key, bytes, {
      httpMetadata: {
        contentType: request.headers.get("Content-Type") || "application/octet-stream",
      },
    });
  }
  return json({ sha256: normalized, bytes: bytes.byteLength });
}

async function handleGetFile(request: Request, env: HubEnv, sha: string): Promise<Response> {
  const key = fileKey(sha);
  const meta = await env.FILES.head(key);
  if (!meta) return error("file not found", 404);

  const headers = fileHeaders(meta);
  const range = parseRange(request.headers.get("Range"), meta.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${meta.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    const length = range.end - range.start + 1;
    const object = await env.FILES.get(key, { range: { offset: range.start, length } });
    if (!object?.body) return error("file not found", 404);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${meta.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  const object = await env.FILES.get(key);
  if (!object?.body) return error("file not found", 404);
  headers.set("Content-Length", String(meta.size));
  return new Response(object.body, { status: 200, headers });
}

async function handleHeadFile(env: HubEnv, sha: string): Promise<Response> {
  const meta = await env.FILES.head(fileKey(sha));
  if (!meta) return new Response(null, { status: 404 });
  const headers = fileHeaders(meta);
  headers.set("Content-Length", String(meta.size));
  return new Response(null, { status: 200, headers });
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: HubEnv): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), cors);

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      let response: Response;

      if (request.method === "GET" && path === "/") {
        response = json({ ok: true, service: "planner-hub" });
      } else if (request.method === "GET" && /^\/cal\/[^/]+\.ics$/.test(path)) {
        response = await handleIcs(request, env);
      } else {
        const auth = await authorize(request, env);
        if (auth.denied) {
          response = auth.denied;
        } else if (request.method === "POST" && path === "/ops") {
          response = await handleOps(request, env, auth.role);
        } else if (request.method === "GET" && path === "/sync") {
          response = await handleSync(request, env);
        } else if (request.method === "POST" && path === "/events") {
          response = await handlePostEvent(request, env);
        } else if (request.method === "GET" && path === "/events") {
          response = await handleGetEvents(request, env);
        } else if (request.method === "POST" && path === "/commands") {
          response = await handlePostCommand(request, env);
        } else if (request.method === "GET" && /^\/commands\/[^/]+$/.test(path)) {
          const row = await env.DB.prepare("SELECT * FROM command WHERE id = ?")
            .bind(decodeSegment(path.split("/")[2]))
            .first();
          response = row ? json({ command: mapCommand(row) }) : error("command not found", 404);
        } else if (request.method === "POST" && path === "/commands/claim") {
          response = await handleClaimCommand(request, env);
        } else if (
          request.method === "POST" &&
          /^\/commands\/[^/]+\/complete$/.test(path)
        ) {
          response = await handleCompleteCommand(request, env, decodeSegment(path.split("/")[2]));
        } else if (/^\/files\/[^/]+$/.test(path) && ["PUT", "GET", "HEAD"].includes(request.method)) {
          const sha = decodeSegment(path.split("/")[2]);
          if (request.method === "PUT") response = await handlePutFile(request, env, sha);
          else if (request.method === "GET") response = await handleGetFile(request, env, sha);
          else response = await handleHeadFile(env, sha);
        } else {
          response = error("not found", 404);
        }
      }
      return withCors(response, cors);
    } catch (caught) {
      const status = caught instanceof HttpError ? caught.status : 500;
      const message = caught instanceof Error ? caught.message : "internal error";
      return withCors(error(message, status), cors);
    }
  },
} satisfies ExportedHandler<HubEnv>;
