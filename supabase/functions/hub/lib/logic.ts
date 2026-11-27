/** Hub router, ported from hub/src/index.ts to plain TypeScript.
 *
 * Storage is injected as `HubStore` + `FileStore`, so the exact same routes,
 * status codes, JSON shapes and CORS rules run on Node (vitest) and Deno.
 */

import type {
  ByteRange,
  CommandRow,
  EventRow,
  FileStore,
  HealthRow,
  HubConfig,
  HubOp,
  HubStore,
  MealRow,
  SyncRow,
  SyncTable,
  TaskRow,
} from "./db.ts";
import {
  buildWidgetView,
  isWidgetDate,
  newWidgetToken,
  nextUpdatedAt,
  compareIsoTimes,
  MAX_WIDGET_TASKS,
  validateHealthRow,
  validateWidgetAction,
  validateWidgetProfile,
  type WidgetAction,
} from "./widget.ts";

const SYNC_TABLES: SyncTable[] = [
  "category",
  "task",
  "goal",
  "meal",
  "message",
  "health",
  "h_subject",
  "h_topic",
  "h_material",
  "h_deadline",
];
const PAGE_SIZE = 500;
const LEASE_SEC = 5 * 60;
const WIDGET_PROFILE_MAX_BYTES = 100 * 1024;
const STALE_ACTION_MS = 5 * 60 * 1000;

// Re-export the pure widget helpers for callers that import from the router.
export {
  buildWidgetView,
  newWidgetToken,
  validateHealthRow,
  validateWidgetAction,
  validateWidgetProfile,
} from "./widget.ts";

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

/** Accept both camelCase (app) and snake_case (raw DB) input keys. */
export function normalize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(row)) {
    const camel = snakeToCamel(key);
    if (camel !== key && !(camel in out)) out[camel] = value;
  }
  if (out.note === undefined && out.noteJson !== undefined) out.note = out.noteJson;
  if (out.attachments === undefined && out.attachmentsJson !== undefined) {
    out.attachments = out.attachmentsJson;
  }
  if (out.workouts === undefined && out.workoutsJson !== undefined) out.workouts = out.workoutsJson;
  return out;
}

export type MessageValidation =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

const MESSAGE_SHA256 = /^[0-9a-f]{64}$/i;
const MAX_TEXT_CHARS = 20_000;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function messageError(error: string): MessageValidation {
  return { ok: false, error };
}

/** Pure validation of a `message` row; returns a copy with text/attachments normalised. */
export function validateMessageRow(row: Record<string, unknown>): MessageValidation {
  if (row.sender !== "planner" && row.sender !== "harness") {
    return messageError("sender must be 'planner' or 'harness'");
  }
  if (typeof row.createdAt !== "string" || row.createdAt === "") {
    return messageError("createdAt must be a non-empty string");
  }

  const text = row.text === undefined || row.text === null ? "" : row.text;
  if (typeof text !== "string") return messageError("text must be a string");
  if (text.length > MAX_TEXT_CHARS) return messageError("text must be at most 20000 characters");

  const rawAttachments = row.attachments === undefined || row.attachments === null ? [] : row.attachments;
  if (!Array.isArray(rawAttachments)) return messageError("attachments must be an array");
  if (rawAttachments.length > MAX_ATTACHMENTS) return messageError("at most 6 attachments allowed");

  const attachments: Record<string, unknown>[] = [];
  for (const item of rawAttachments) {
    if (!isRecord(item)) return messageError("each attachment must be an object");
    if (typeof item.sha256 !== "string" || !MESSAGE_SHA256.test(item.sha256)) {
      return messageError("attachment sha256 must be a 64-character hex string");
    }
    if (
      typeof item.mime !== "string" ||
      (!item.mime.startsWith("image/") && !item.mime.startsWith("audio/"))
    ) {
      return messageError("attachment mime must start with 'image/' or 'audio/'");
    }
    if (typeof item.name !== "string") return messageError("attachment name must be a string");
    if (
      typeof item.bytes !== "number" ||
      !Number.isFinite(item.bytes) ||
      item.bytes < 0 ||
      item.bytes > MAX_ATTACHMENT_BYTES
    ) {
      return messageError("attachment bytes must be between 0 and 15 MB");
    }
    if (item.durationSec !== undefined) {
      if (
        typeof item.durationSec !== "number" ||
        !Number.isFinite(item.durationSec) ||
        item.durationSec < 0
      ) {
        return messageError("attachment durationSec must be a non-negative finite number");
      }
    }
    const attachment: Record<string, unknown> = {
      sha256: item.sha256,
      name: item.name,
      mime: item.mime,
      bytes: item.bytes,
    };
    if (item.durationSec !== undefined) attachment.durationSec = item.durationSec;
    attachments.push(attachment);
  }

  if (text.trim() === "" && attachments.length === 0) {
    return messageError("text or an attachment required");
  }

  return { ok: true, row: { ...row, text, attachments } };
}

export function compareUpdatedAt(a: unknown, b: unknown): number {
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

/** SHA-256 hex digest using Web Crypto (Node 20+ and Deno). */
export async function sha256Hex(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Return the bearer token from an Authorization header, or null. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/** h_* tables may only be written by a device with the "harness" role. */
export function canWriteTable(role: string | null, table: string): boolean {
  if (table.startsWith("h_")) return role === "harness";
  return true;
}

function corsHeaders(request: Request, env: HubConfig): Headers {
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

function toEventRow(row: EventRow): EventRow {
  return {
    id: String(row.id),
    type: String(row.type),
    source: row.source === null ? null : String(row.source),
    origin: row.origin === null ? null : String(row.origin),
    payload: parsePayload(row.payload),
    ts: String(row.ts),
    idempotencyKey: String(row.idempotencyKey),
  };
}

function toCommandRow(row: CommandRow): CommandRow {
  return {
    id: String(row.id),
    type: String(row.type),
    payload: parsePayload(row.payload),
    status: row.status,
    claimedBy: row.claimedBy === null ? null : String(row.claimedBy),
    leaseUntil: row.leaseUntil === null ? null : String(row.leaseUntil),
    result: parsePayload(row.result),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// ── Widget actions ──────────────────────────────────────────────────────────

/** Apply one validated widget action through the same upsert path as /ops. */
async function applyWidgetAction(store: HubStore, raw: unknown): Promise<Response> {
  const validated = validateWidgetAction(raw);
  if (!validated.ok) throw new HttpError("action: " + validated.error, 400);
  const action: WidgetAction = validated.action;

  if (action.type === "task.set_done") {
    const found = await store.getSyncRow("task", action.taskId);
    if (!found || (found as TaskRow).deletedAt) throw new HttpError("task not found", 404);
    const task = found as TaskRow;
    if (
      compareIsoTimes(task.updatedAt, action.at) > 0 &&
      Date.now() - Date.parse(action.at) > STALE_ACTION_MS
    ) {
      return json({ ok: true, ignored: true });
    }
    const completedAt = action.done ? action.at : null;
    // Repeating an already-applied action is a no-op.
    if (
      Boolean(task.done) === action.done &&
      (task.completedAt ?? null) === completedAt &&
      compareIsoTimes(task.updatedAt, action.at) >= 0
    ) {
      return json({ ok: true });
    }
    const updatedAt = nextUpdatedAt(String(task.updatedAt), action.at);
    await store.upsertRows([{
      table: "task",
      row: { ...task, done: action.done, completedAt, updatedAt } as unknown as SyncRow,
    }]);
    return json({ ok: true });
  }

  if (action.type === "calories.add") {
    const found = await store.getSyncRow("meal", action.id);
    if (found) {
      const meal = found as MealRow;
      if (
        !meal.deletedAt &&
        meal.kcal === action.kcal &&
        compareIsoTimes(meal.updatedAt, action.at) >= 0
      ) {
        return json({ ok: true });
      }
    }
    await store.upsertRows([{
      table: "meal",
      row: {
        id: action.id,
        date: action.date,
        slot: "",
        label: "",
        kcal: action.kcal,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
      } as unknown as SyncRow,
    }]);
    return json({ ok: true });
  }

  const found = await store.getSyncRow("meal", action.id);
  if (!found) throw new HttpError("meal not found", 404);
  const meal = found as MealRow;
  if (meal.deletedAt === action.at) return json({ ok: true });
  await store.upsertRows([{
    table: "meal",
    row: {
      ...meal,
      deletedAt: action.at,
      updatedAt: nextUpdatedAt(String(meal.updatedAt), action.at, true),
    } as unknown as SyncRow,
  }]);
  return json({ ok: true });
}

// ── Calendar ────────────────────────────────────────────────────────────────

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

/** Render the iCalendar feed for the given timed tasks. */
export function buildIcs(tasks: TaskRow[], now: Date = new Date()): string {
  const nowStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planner//Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const task of tasks) {
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
  return lines.join("\r\n") + "\r\n";
}

// ── Files ───────────────────────────────────────────────────────────────────

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export type ParsedRange = { start: number; end: number } | null | "invalid";

/** Convert a single `Range: bytes=…` header into an inclusive byte range. */
export function parseRange(header: string | null, size: number): ParsedRange {
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

function fileHeaders(contentType: string): Headers {
  const headers = new Headers();
  headers.set("Content-Type", contentType || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  return headers;
}

// ── Router ──────────────────────────────────────────────────────────────────

/** Dispatch one request. Mirrors the Cloudflare Worker's `fetch`. */
export async function handle(
  request: Request,
  store: HubStore,
  files: FileStore,
  env: HubConfig,
): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), cors);

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    let response: Response;

    if (request.method === "GET" && path === "/") {
      response = json({ ok: true, service: "planner-hub" });
    } else if (request.method === "GET" && /^\/cal\/[^/]+\.ics$/.test(path)) {
      const match = /^\/cal\/([^/]+)\.ics$/.exec(path);
      let secret: string | null = null;
      if (match) {
        try {
          secret = decodeURIComponent(match[1]);
        } catch {
          secret = null;
        }
      }
      if (!secret || !env.CAL_SECRET || secret !== env.CAL_SECRET) {
        response = error("calendar not found", 404);
      } else {
        const text = buildIcs(await store.timedTasks());
        response = new Response(text, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, no-store",
          },
        });
      }
    } else {
      const token = parseBearer(request.headers.get("Authorization"));
      if (!token) {
        response = error("missing bearer token", 401);
      } else {
        const device = await store.findDeviceByTokenHash(await sha256Hex(token));
        if (!device) {
          response = error("unauthorized", 401);
        } else {
          const role = device.role ?? "user";
          const isWidgetView = request.method === "GET" && path === "/widget";
          const isWidgetAction = request.method === "POST" && path === "/widget/action";

          // A widget token can only read the widget and submit widget actions.
          const widgetLocked = role === "widget" && !isWidgetView && !isWidgetAction;

          if (widgetLocked) {
            response = error("widget role cannot access this route", 403);
          } else if (request.method === "POST" && path === "/ops") {
            const body = await readJson(request);
            if (!isRecord(body) || !Array.isArray(body.ops)) {
              throw new HttpError("expected { ops: [...] }", 400);
            }
            if (
              body.ops.some(
                (op) => isRecord(op) && typeof op.table === "string" && !canWriteTable(role, op.table),
              )
            ) {
              throw new HttpError("harness role required for h_* tables", 403);
            }
            const ops: HubOp[] = [];
            for (const op of body.ops) {
              if (!isRecord(op) || !isSyncTable(op.table) || !isRecord(op.row)) {
                throw new HttpError("each op needs a supported table and a row", 400);
              }
              const row = normalize(op.row);
              if (
                typeof row.id !== "string" ||
                !row.id ||
                typeof row.updatedAt !== "string" ||
                !row.updatedAt
              ) {
                throw new HttpError("row needs id and updatedAt", 400);
              }
              let pushed = row;
              if (op.table === "message") {
                const validated = validateMessageRow(row);
                if (!validated.ok) throw new HttpError("message: " + validated.error, 400);
                pushed = validated.row;
              } else if (op.table === "health") {
                const validated = validateHealthRow(row);
                if (!validated.ok) throw new HttpError("health: " + validated.error, 400);
                pushed = validated.row as unknown as Record<string, unknown>;
              }
              ops.push({ table: op.table, row: pushed as unknown as SyncRow });
            }
            const { applied, cursor } = await store.upsertRows(ops);
            response = json({ applied, cursor });
          } else if (request.method === "GET" && path === "/sync") {
            const rawSince = url.searchParams.get("since");
            const since = Math.max(0, Number.parseInt(rawSince ?? "0", 10) || 0);
            response = json(await store.changesSince(since, PAGE_SIZE));
          } else if (request.method === "POST" && path === "/events") {
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
            const result = await store.insertEvent({
              id,
              type: body.type as string,
              source: typeof body.source === "string" ? body.source : null,
              origin: typeof body.origin === "string" ? body.origin : null,
              payload: body.payload ?? null,
              ts,
              idempotencyKey,
            });
            response = json(result, result.deduplicated ? 200 : 201);
          } else if (request.method === "GET" && path === "/events") {
            const rawSince = url.searchParams.get("since") ?? "0";
            const since: number | string = /^\d+$/.test(rawSince) ? Number(rawSince) : rawSince;
            const { events, cursor, more } = await store.eventsSince(since, PAGE_SIZE);
            response = json({ events: events.map(toEventRow), cursor, more });
          } else if (request.method === "POST" && path === "/commands") {
            const raw = await readJson(request);
            if (!isRecord(raw) || typeof raw.type !== "string" || !raw.type) {
              throw new HttpError("command needs a type", 400);
            }
            const body = normalize(raw);
            const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
            response = json(await store.enqueueCommand({ id, type: body.type as string, payload: body.payload ?? null }), 201);
          } else if (request.method === "GET" && /^\/commands\/[^/]+$/.test(path)) {
            const found = await store.getCommand(decodeSegment(path.split("/")[2]));
            response = found ? json({ command: toCommandRow(found) }) : error("command not found", 404);
          } else if (request.method === "POST" && path === "/commands/claim") {
            const body = await readJson(request);
            if (!isRecord(body) || typeof body.device !== "string" || !body.device) {
              throw new HttpError("claim needs a device", 400);
            }
            const claimed = await store.claimCommand(body.device, LEASE_SEC);
            response = json({ command: claimed ? toCommandRow(claimed) : null });
          } else if (request.method === "POST" && /^\/commands\/[^/]+\/complete$/.test(path)) {
            const id = decodeSegment(path.split("/")[2]);
            const raw = await readJson(request);
            if (!isRecord(raw)) throw new HttpError("expected a JSON object", 400);
            const body = normalize(raw);
            if (body.status !== "done" && body.status !== "failed") {
              throw new HttpError("status must be done or failed", 400);
            }
            const completed = await store.completeCommand(id, body.status, body.result ?? null);
            if (!completed) {
              response = error("command not found", 404);
            } else {
              response = json({ ok: true, command: toCommandRow(completed) });
            }
          } else if (/^\/files\/[^/]+$/.test(path) && ["PUT", "GET", "HEAD"].includes(request.method)) {
            const sha = decodeSegment(path.split("/")[2]);
            if (request.method === "PUT") {
              const normalized = sha.toLowerCase();
              if (!isSha256(normalized)) throw new HttpError("invalid sha256", 400);
              const bytes = await request.arrayBuffer();
              if ((await sha256Hex(bytes)) !== normalized) throw new HttpError("sha256 mismatch", 400);
              if (!(await files.head(normalized))) {
                await files.put(normalized, bytes, request.headers.get("Content-Type") || "application/octet-stream");
              }
              response = json({ sha256: normalized, bytes: bytes.byteLength });
            } else if (request.method === "HEAD") {
              const meta = await files.head(sha);
              if (!meta) {
                response = new Response(null, { status: 404 });
              } else {
                const headers = fileHeaders(meta.contentType);
                headers.set("Content-Length", String(meta.size));
                response = new Response(null, { status: 200, headers });
              }
            } else {
              const meta = await files.head(sha);
              if (!meta) {
                response = error("file not found", 404);
              } else {
                const headers = fileHeaders(meta.contentType);
                const range = parseRange(request.headers.get("Range"), meta.size);
                if (range === "invalid") {
                  headers.set("Content-Range", `bytes */${meta.size}`);
                  response = new Response(null, { status: 416, headers });
                } else if (range) {
                  const length = range.end - range.start + 1;
                  const object = await files.get(sha, { start: range.start, end: range.end } as ByteRange);
                  if (!object?.body) {
                    response = error("file not found", 404);
                  } else {
                    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${meta.size}`);
                    headers.set("Content-Length", String(length));
                    response = new Response(object.body, { status: 206, headers });
                  }
                } else {
                  const object = await files.get(sha);
                  if (!object?.body) {
                    response = error("file not found", 404);
                  } else {
                    headers.set("Content-Length", String(meta.size));
                    response = new Response(object.body, { status: 200, headers });
                  }
                }
              }
            }
          } else if (isWidgetView) {
            if (role !== "widget" && role !== "user") {
              throw new HttpError("widget or user role required", 403);
            }
            const date = url.searchParams.get("date");
            if (!isWidgetDate(date)) throw new HttpError("valid date required", 400);

            const tasks = await store.listWidgetTasks(date as string);
            const [profile, categories, meals, health] = await Promise.all([
              store.getWidgetProfile(),
              store.listWidgetCategories(),
              store.listWidgetMeals(date as string),
              store.getSyncRow("health", `health_${date}`),
            ]);
            response = json(
              buildWidgetView({
                date: date as string,
                generatedAt: new Date().toISOString(),
                profile: profile ? profile.data : null,
                categories,
                meals,
                tasks: tasks.slice(0, MAX_WIDGET_TASKS),
                health: health ? (health as unknown as HealthRow) : null,
              }),
            );
          } else if (isWidgetAction) {
            if (role !== "widget" && role !== "user") {
              throw new HttpError("widget or user role required", 403);
            }
            const body = await readJson(request);
            response = await applyWidgetAction(store, body);
          } else if (request.method === "POST" && path === "/widget/token") {
            if (role !== "user") throw new HttpError("user role required", 403);
            const token = newWidgetToken();
            await store.replaceWidgetDevice(await sha256Hex(token));
            response = json({ token }, 201);
          } else if (request.method === "PUT" && path === "/widget/profile") {
            if (role !== "user") throw new HttpError("user role required", 403);
            const bytes = await request.arrayBuffer();
            if (bytes.byteLength > WIDGET_PROFILE_MAX_BYTES) {
              throw new HttpError("profile body exceeds 100 KB", 400);
            }
            let body: unknown;
            try {
              body = JSON.parse(new TextDecoder().decode(bytes));
            } catch {
              throw new HttpError("invalid JSON body", 400);
            }
            const validated = validateWidgetProfile(body);
            if (!validated.ok) throw new HttpError("profile: " + validated.error, 400);
            await store.putWidgetProfile(validated.data);
            response = json({ ok: true });
          } else {
            response = error("not found", 404);
          }
        }
      }
    }
    return withCors(response, cors);
  } catch (caught) {
    const status = caught instanceof HttpError ? caught.status : 500;
    const message = caught instanceof Error ? caught.message : "internal error";
    return withCors(error(message, status), cors);
  }
}
