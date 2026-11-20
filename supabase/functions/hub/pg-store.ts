// HubStore + FileStore on Supabase (Postgres via supabase-js, blobs in Storage). Deno only.
// Thin by design: routing/validation live in ./lib/logic.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ByteRange, CommandInput, CommandRow, CommandStatus, Device, EventInput, EventResult,
  EventsResult, FileMeta, FileObject, FileStore, HubOp, HubStore, SyncChange, SyncResult,
  SyncTable, TaskRow, UpsertResult,
} from "./lib/db.ts";
import { compareUpdatedAt, normalize } from "./lib/logic.ts";

export function createServiceClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Kind = "s" | "n" | "b" | "j";
// [camelCase API field, snake_case column, kind]; b = boolean stored as 0/1, j = jsonb
const COLUMNS: Record<SyncTable, Array<[string, string, Kind]>> = {
  category: [["id","id","s"],["name","name","s"],["color","color","s"],["icon","icon","s"],["order","order","n"],["linkedSubjectId","linked_subject_id","s"],["archived","archived","b"],["createdAt","created_at","s"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  task: [["id","id","s"],["title","title","s"],["date","date","s"],["categoryId","category_id","s"],["parentId","parent_id","s"],["seriesId","series_id","s"],["order","order","n"],["done","done","b"],["completedAt","completed_at","s"],["time","time","s"],["durationMin","duration_min","n"],["rrule","rrule","s"],["deadline","deadline","b"],["kind","kind","s"],["note","note_json","j"],["createdAt","created_at","s"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  goal: [["id","id","s"],["period","period","s"],["metric","metric","s"],["target","target","n"],["scopeCategoryId","scope_category_id","s"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  meal: [["id","id","s"],["date","date","s"],["slot","slot","s"],["label","label","s"],["kcal","kcal","n"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  h_subject: [["id","id","s"],["name","name","s"],["color","color","s"],["order","order","n"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  h_topic: [["id","id","s"],["subjectId","subject_id","s"],["name","name","s"],["order","order","n"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  h_material: [["id","id","s"],["subjectId","subject_id","s"],["topicId","topic_id","s"],["fileName","file_name","s"],["title","title","s"],["kind","kind","s"],["sha256","sha256","s"],["pageCount","page_count","n"],["lecture","lecture","s"],["date","date","s"],["addedAt","added_at","s"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
  h_deadline: [["id","id","s"],["subjectId","subject_id","s"],["topicId","topic_id","s"],["title","title","s"],["due","due","s"],["kind","kind","s"],["done","done","b"],["updatedAt","updated_at","s"],["deletedAt","deleted_at","s"]],
};

function toDb(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [camel, col, kind] of COLUMNS[table]) {
    const v = row[camel];
    if (v === undefined) continue;
    out[col] = kind === "b" ? (v ? 1 : 0) : v;
  }
  return out;
}

function fromDb(table: SyncTable, rec: Record<string, unknown>): SyncChange["row"] {
  const out: Record<string, unknown> = {};
  for (const [camel, col, kind] of COLUMNS[table]) {
    const v = rec[col] ?? null;
    out[camel] = kind === "b" ? Number(v) === 1 : v;
  }
  return out as unknown as SyncChange["row"];
}

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

function commandRow(r: Record<string, unknown>): CommandRow {
  return {
    id: String(r.id), type: String(r.type), payload: r.payload_json ?? null,
    status: r.status as CommandStatus,
    claimedBy: (r.claimed_by as string | null) ?? null,
    leaseUntil: (r.lease_until as string | null) ?? null,
    result: r.result_json ?? null,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}

export class PgStore implements HubStore {
  constructor(private db: SupabaseClient) {}

  async findDeviceByTokenHash(hash: string): Promise<Device | null> {
    const { data, error } = await this.db.from("device").select("id, role")
      .eq("token_hash", hash).is("revoked_at", null).maybeSingle();
    fail(error, "device lookup");
    return data ? { id: data.id, role: data.role } : null;
  }

  async upsertRows(ops: HubOp[]): Promise<UpsertResult> {
    const rows: SyncChange[] = [];
    for (const op of ops) {
      const row = normalize(op.row as unknown as Record<string, unknown>);
      const id = String(row.id);
      const updatedAt = String(row.updatedAt);
      const { data: existing, error: e1 } = await this.db.from(op.table)
        .select("updated_at").eq("id", id).maybeSingle();
      fail(e1, `read ${op.table}`);
      if (existing && compareUpdatedAt(updatedAt, existing.updated_at) < 0) continue;
      const { error: e2 } = await this.db.from(op.table).upsert(toDb(op.table, row));
      fail(e2, `write ${op.table}`);
      const { error: e3 } = await this.db.from("change_log")
        .insert({ table_name: op.table, row_id: id, updated_at: updatedAt });
      fail(e3, "change_log");
      rows.push({ table: op.table, row: row as unknown as SyncChange["row"] });
    }
    return { applied: rows.length, cursor: await this.maxSeq(), rows };
  }

  private async maxSeq(): Promise<number> {
    const { data, error } = await this.db.from("change_log").select("seq")
      .order("seq", { ascending: false }).limit(1);
    fail(error, "cursor");
    return data?.[0] ? Number(data[0].seq) : 0;
  }

  async changesSince(since: number, limit: number): Promise<SyncResult> {
    const { data, error } = await this.db.from("change_log")
      .select("seq, table_name, row_id").gt("seq", since).order("seq").limit(limit + 1);
    fail(error, "changes");
    const entries = data ?? [];
    const more = entries.length > limit;
    const page = more ? entries.slice(0, limit) : entries;
    const idsByTable = new Map<SyncTable, string[]>();
    for (const e of page) {
      const t = e.table_name as SyncTable;
      idsByTable.set(t, [...(idsByTable.get(t) ?? []), e.row_id]);
    }
    const current = new Map<string, Record<string, unknown>>();
    for (const [table, ids] of idsByTable) {
      const { data: rows, error: err } = await this.db.from(table).select("*").in("id", ids);
      fail(err, `read ${table}`);
      for (const r of rows ?? []) current.set(`${table}:${r.id}`, r);
    }
    const changes: SyncChange[] = [];
    for (const e of page) {
      const rec = current.get(`${e.table_name}:${e.row_id}`);
      if (rec) changes.push({ table: e.table_name as SyncTable, row: fromDb(e.table_name as SyncTable, rec) });
    }
    return { changes, cursor: page.length ? Number(page[page.length - 1].seq) : since, more };
  }

  async insertEvent(input: EventInput): Promise<EventResult> {
    const find = async () => {
      const { data, error } = await this.db.from("event").select("id")
        .eq("idempotency_key", input.idempotencyKey).maybeSingle();
      fail(error, "event lookup");
      return data;
    };
    const existing = await find();
    if (existing) return { id: existing.id, deduplicated: true };
    const { error } = await this.db.from("event").insert({
      id: input.id, type: input.type, source: input.source, origin: input.origin,
      payload_json: input.payload, ts: input.ts, idempotency_key: input.idempotencyKey,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const again = await find();
        if (again) return { id: again.id, deduplicated: true };
      }
      fail(error, "event insert");
    }
    return { id: input.id, deduplicated: false };
  }

  async eventsSince(since: number | string, limit: number): Promise<EventsResult> {
    const numeric = typeof since === "number";
    let q = this.db.from("event").select("*");
    q = numeric ? q.gt("seq", since) : q.gt("ts", since);
    const { data, error } = await q.order("seq").limit(limit + 1);
    fail(error, "events");
    const all = data ?? [];
    const more = all.length > limit;
    const page = more ? all.slice(0, limit) : all;
    const last = page[page.length - 1];
    const cursor = last ? (numeric ? Number(last.seq) : String(last.ts)) : since;
    return {
      events: page.map((r) => ({
        id: r.id, type: r.type, source: r.source, origin: r.origin,
        payload: r.payload_json ?? null, ts: r.ts, idempotencyKey: r.idempotency_key,
      })),
      cursor, more,
    };
  }

  async enqueueCommand(c: CommandInput): Promise<{ id: string }> {
    const now = new Date().toISOString();
    const { error } = await this.db.from("command").insert({
      id: c.id, type: c.type, payload_json: c.payload, status: "queued",
      created_at: now, updated_at: now,
    });
    fail(error, "enqueue");
    return { id: c.id };
  }

  async getCommand(id: string): Promise<CommandRow | null> {
    const { data, error } = await this.db.from("command").select("*").eq("id", id).maybeSingle();
    fail(error, "get command");
    return data ? commandRow(data) : null;
  }

  async claimCommand(device: string, leaseSec: number): Promise<CommandRow | null> {
    const { data, error } = await this.db.rpc("claim_command", {
      p_device: device, p_lease_seconds: leaseSec,
    });
    fail(error, "claim");
    const rec = Array.isArray(data) ? data[0] : data;
    return rec && rec.id ? commandRow(rec) : null;
  }

  async completeCommand(id: string, status: CommandStatus, result: unknown): Promise<CommandRow | null> {
    const { data, error } = await this.db.from("command")
      .update({ status, result_json: result, lease_until: null, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").maybeSingle();
    fail(error, "complete");
    return data ? commandRow(data) : null;
  }

  async timedTasks(): Promise<TaskRow[]> {
    const { data, error } = await this.db.from("task").select("*")
      .not("time", "is", null).neq("time", "").is("deleted_at", null)
      .order("date").order("order").order("id");
    fail(error, "timed tasks");
    return (data ?? []).map((r) => fromDb("task", r) as unknown as TaskRow);
  }
}

export class StorageFileStore implements FileStore {
  constructor(private db: SupabaseClient) {}
  private bucket() { return this.db.storage.from("files"); }

  async head(sha: string): Promise<FileMeta | null> {
    const { data, error } = await this.bucket().list("", { search: sha, limit: 5 });
    fail(error, "file head");
    const hit = data?.find((f) => f.name === sha);
    if (!hit) return null;
    const meta = (hit.metadata ?? {}) as { size?: number; mimetype?: string };
    return { size: Number(meta.size ?? 0), contentType: meta.mimetype ?? "application/octet-stream" };
  }

  async put(sha: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
    if (await this.head(sha)) return;
    const { error } = await this.bucket().upload(sha, bytes, { contentType, upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) fail(error, "file put");
  }

  async get(sha: string, range?: ByteRange): Promise<FileObject | null> {
    const { data, error } = await this.bucket().download(sha);
    if (error || !data) return null;
    const buf = await data.arrayBuffer();
    return { body: range ? buf.slice(range.start, range.end + 1) : buf };
  }
}
