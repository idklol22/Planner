import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubOp, PullResult, PullRow, TaskRow } from "../storage/hub";
import {
  CONFLICTS_KEY,
  describeConflicts,
  LocalConflictStore,
  type ConflictRecord,
} from "./conflicts";
import { SyncEngine, type CursorStore, type SyncEngineOptions } from "./engine";
import { FakeHub } from "./fake-hub";
import { LocalOutbox } from "./queue";

const T0 = "2026-11-20T09:00:00.000Z";
const T1 = "2026-11-20T10:00:00.000Z";
const T2 = "2026-11-20T11:00:00.000Z";

function task(id: string, updatedAt = T1, title = `Task ${id}`): TaskRow {
  return {
    id,
    title,
    date: "2026-11-20",
    categoryId: null,
    parentId: null,
    seriesId: null,
    order: 0,
    done: false,
    completedAt: null,
    time: null,
    durationMin: null,
    rrule: null,
    deadline: false,
    kind: "general",
    note: null,
    createdAt: T0,
    updatedAt,
    deletedAt: null,
    archivedAt: null,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    has: (key: string) => data.has(key),
  };
}

function setup(
  hub: FakeHub,
  initial: TaskRow[] = [],
  cursorStart = 0,
  overrides: { client?: SyncEngineOptions["client"] } = {},
) {
  const storage = memoryStorage();
  const outbox = new LocalOutbox(storage);
  const conflicts = new LocalConflictStore(storage);
  const local = new Map<string, PullRow>();
  for (const row of initial) local.set(`task:${row.id}`, row);
  let cursor = cursorStart;
  const cursorStore: CursorStore = { get: () => cursor, set: (next) => void (cursor = next) };
  const reported: ConflictRecord[][] = [];
  const engine = new SyncEngine({
    client: overrides.client ?? { push: hub.push, pull: hub.pull },
    getLocal: (table, id) => local.get(`${table}:${id}`) ?? null,
    applyRemote: (table, row) => void local.set(`${table}:${row.id}`, row),
    cursorStore,
    outbox,
    conflicts,
    onConflicts: (records) => void reported.push(records),
  });
  return { engine, outbox, conflicts, storage, local, reported, get cursor() { return cursor; } };
}

function enqueue(outbox: LocalOutbox, row: TaskRow): void {
  outbox.enqueue({ table: "task", row } satisfies HubOp);
}

function seedTask(hub: FakeHub, row: TaskRow): void {
  hub.seed({ table: "task", row } satisfies HubOp);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rejected edits", () => {
  it("copies the losing row verbatim, converges to the hub row and never replays", async () => {
    const hub = new FakeHub();
    const losing = task("a", T1, "My edit");
    const winning = task("a", T2, "Other device");
    seedTask(hub,winning);
    const s = setup(hub, [losing]);
    enqueue(s.outbox, losing);

    await s.engine.push();

    expect(hub.pushes).toHaveLength(1);
    expect(s.outbox.size()).toBe(0);
    expect(hub.pulls.length).toBeGreaterThan(0);
    expect(s.local.get("task:a")).toEqual(winning);
    expect(s.conflicts.all()).toEqual([
      { table: "task", row: losing, savedAt: expect.any(String), reason: "superseded" },
    ]);
    expect(JSON.parse(s.storage.getItem(CONFLICTS_KEY) ?? "[]")[0].row).toEqual(losing);
    expect(s.reported).toHaveLength(1);
    expect(describeConflicts(s.reported[0])).toContain("My edit");

    await s.engine.syncNow();
    expect(hub.pushes).toHaveLength(1);
    expect(s.reported).toHaveLength(1);
  });

  it("treats a repeat of an already stored row as harmless", async () => {
    const hub = new FakeHub();
    const sent = task("a", T1, "Same");
    seedTask(hub,task("a", T2, "Same")); // newer stamp, identical content
    const s = setup(hub, [sent]);
    enqueue(s.outbox, sent);

    await s.engine.push();

    expect(hub.pushes[0]).toHaveLength(1);
    expect(hub.pulls.length).toBeGreaterThan(0);
    expect(s.outbox.size()).toBe(0);
    expect(s.conflicts.all()).toEqual([]);
    expect(s.reported).toEqual([]);
  });

  it("copies only the losing row in a partially applied batch", async () => {
    const hub = new FakeHub();
    const repeat = task("repeat", T1, "Repeat");
    const losing = task("loser", T1, "Mine");
    const fresh = task("fresh", T1, "Fresh");
    seedTask(hub,task("repeat", T2, "Repeat"));
    seedTask(hub,task("loser", T2, "Other device"));
    const s = setup(hub, [repeat, losing]);
    s.outbox.enqueueAll([
      { table: "task", row: repeat },
      { table: "task", row: losing },
      { table: "task", row: fresh },
    ]);

    await s.engine.push();

    expect(hub.pushes).toHaveLength(1);
    expect(hub.get("task", "fresh")).toEqual(fresh);
    expect(s.conflicts.all().map((record) => record.row.id)).toEqual(["loser"]);
    expect(s.conflicts.all()[0].row).toEqual(losing);
    expect(s.local.get("task:loser")).toMatchObject({ title: "Other device" });
    expect(s.reported).toHaveLength(1);
  });

  it("keeps an offline op queued and does not report a conflict", async () => {
    vi.useFakeTimers();
    const hub = new FakeHub();
    hub.offline(1);
    const s = setup(hub);
    const row = task("a", T1, "My edit");
    enqueue(s.outbox, row);

    await s.engine.push();
    expect(hub.pushes).toHaveLength(1);
    expect(s.outbox.size()).toBe(1);
    expect(s.conflicts.all()).toEqual([]);
    expect(s.reported).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(hub.pushes).toHaveLength(2);
    expect(s.outbox.size()).toBe(0);
    expect(s.conflicts.all()).toEqual([]);
  });

  it("converges two devices without replaying the losing edit", async () => {
    const hub = new FakeHub();
    const winning = task("shared", T2, "A wins");
    const losing = task("shared", T1, "B edit");
    const a = setup(hub, [winning]);
    const b = setup(hub, [losing]);
    enqueue(a.outbox, winning);
    enqueue(b.outbox, losing);

    await a.engine.push();
    await b.engine.push();

    expect(b.conflicts.all()).toHaveLength(1);
    expect(b.conflicts.all()[0].row).toEqual(losing);
    expect(b.local.get("task:shared")).toEqual(winning);
    expect(b.reported).toHaveLength(1);

    await b.engine.syncNow();
    await a.engine.syncNow();

    expect(hub.pushes).toHaveLength(2); // no echo, no replay
    expect(b.reported).toHaveLength(1);
    expect(a.local.get("task:shared")).toEqual(winning);
    expect(b.local.get("task:shared")).toEqual(winning);
    expect(hub.get("task", "shared")).toEqual(winning);
  });

  it("does not pull or notify when every op applied", async () => {
    const hub = new FakeHub();
    const s = setup(hub);
    enqueue(s.outbox, task("a"));

    await s.engine.push();

    expect(hub.pushes).toHaveLength(1);
    expect(hub.pulls).toEqual([]);
    expect(s.conflicts.all()).toEqual([]);
    expect(s.reported).toEqual([]);
    expect(s.outbox.size()).toBe(0);
  });

  it("finds a conflicting row written before our cursor", async () => {
    const hub = new FakeHub(1); // force /sync pagination
    seedTask(hub,task("other1", T0));
    seedTask(hub,task("other2", T0));
    const winning = task("a", T2, "Other device");
    seedTask(hub,winning);
    const losing = task("a", T1, "My edit");
    const s = setup(hub, [losing], hub.cursor);
    enqueue(s.outbox, losing);

    await s.engine.push();

    expect(s.conflicts.all().map((record) => (record.row as TaskRow).title)).toEqual(["My edit"]);
    expect(s.local.get("task:a")).toEqual(winning);
  });

  it("keeps a copy but does not guess when the hub row cannot be read", async () => {
    const hub = new FakeHub();
    const client: SyncEngineOptions["client"] = {
      push: async () => ({ applied: 0, cursor: 1 }),
      pull: async (_since?: number): Promise<PullResult> => ({
        changes: [],
        cursor: 0,
        more: false,
      }),
    };
    const s = setup(hub, [], 0, { client });
    const losing = task("a", T1, "My edit");
    enqueue(s.outbox, losing);

    await s.engine.push();

    expect(s.outbox.size()).toBe(0);
    expect(s.conflicts.all()).toEqual([
      { table: "task", row: losing, savedAt: expect.any(String), reason: "unconfirmed" },
    ]);
    expect(s.reported).toHaveLength(1);
    expect(describeConflicts(s.reported[0])).not.toContain("newer version");
  });
});
