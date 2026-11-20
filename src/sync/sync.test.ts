import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CategoryRow,
  HubOp,
  PullResult,
  PullRow,
  PullTable,
  PushResult,
  SyncRow,
  TaskRow,
} from "../storage/hub";
import { SyncEngine, type CursorStore } from "./engine";
import { LocalOutbox, OUTBOX_KEY } from "./queue";

const T0 = "2026-11-20T09:00:00.000Z";
const T1 = "2026-11-20T10:00:00.000Z";
const T2 = "2026-11-20T11:00:00.000Z";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

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
  };
}

function category(id: string, updatedAt = T1): CategoryRow {
  return {
    id,
    name: `Category ${id}`,
    color: "#ffffff",
    icon: null,
    order: 0,
    linkedSubjectId: null,
    archived: false,
    createdAt: T0,
    updatedAt,
    deletedAt: null,
  };
}

function op(table: HubOp["table"], row: SyncRow): HubOp {
  return { table, row };
}

function fakeClient() {
  const push = vi.fn(async (_ops: HubOp[]): Promise<PushResult> => ({
    applied: 0,
    cursor: 1,
  }));
  const pull = vi.fn(
    async (_since: number): Promise<PullResult> => ({
      changes: [],
      cursor: 0,
      more: false,
    }),
  );
  return { push, pull };
}

type FakeClient = ReturnType<typeof fakeClient>;

function cursorStore(initial = 0): CursorStore & { value(): number } {
  let current = initial;
  return {
    get: () => current,
    set: (next: number) => {
      current = next;
    },
    value: () => current,
  };
}

function engineFor(
  client: FakeClient,
  local = new Map<string, PullRow>(),
  cursor = cursorStore(),
  applied: Array<{ table: PullTable; row: PullRow }> = [],
) {
  const engine = new SyncEngine({
    client,
    getLocal: (table, id) => local.get(`${table}:${id}`) ?? null,
    applyRemote: (table, row) => {
      local.set(`${table}:${row.id}`, row);
      applied.push({ table, row });
    },
    cursorStore: cursor,
  });
  return { engine, local, cursor, applied };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("outbox", () => {
  it("merges per table+id and keeps only the newest updatedAt", () => {
    const outbox = new LocalOutbox();
    outbox.enqueue(op("task", task("a", T1, "old")));
    outbox.enqueue(op("task", task("b", T0)));
    outbox.enqueue(op("task", task("a", T2, "new")));
    outbox.enqueue(op("task", task("a", T0, "stale")));
    outbox.enqueue(op("category", category("a", T1)));

    const pending = outbox.pending();
    expect(pending).toHaveLength(3);
    expect(pending.map((entry) => `${entry.table}:${entry.row.id}`)).toEqual([
      "task:a",
      "task:b",
      "category:a",
    ]);
    expect(pending[0].row).toMatchObject({ title: "new", updatedAt: T2 });
    expect(JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]")).toHaveLength(3);
  });

  it("acks only the exact sent rows, keeping newer in-flight replacements", () => {
    const outbox = new LocalOutbox();
    outbox.enqueue(op("task", task("a", T1, "old")));
    const sent = outbox.pending();

    outbox.enqueue(op("task", task("a", T2, "newer arrived in flight")));
    outbox.ack(sent);

    expect(outbox.pending()).toHaveLength(1);
    expect(outbox.pending()[0].row).toMatchObject({ title: "newer arrived in flight" });

    outbox.ack(outbox.pending());
    expect(outbox.size()).toBe(0);
    expect(localStorage.getItem(OUTBOX_KEY)).toBeNull();
  });

  it("pushes the outbox in batches of 200 and clears acknowledged ops", async () => {
    const client = fakeClient();
    const { engine } = engineFor(client);
    for (let i = 0; i < 450; i += 1) {
      engine.outbox.enqueue(op("task", task(`t${i}`)));
    }

    await engine.push();

    expect(client.push).toHaveBeenCalledTimes(3);
    expect(client.push.mock.calls.map((call) => call[0].length)).toEqual([
      200, 200, 50,
    ]);
    expect(engine.outbox.size()).toBe(0);
  });
});

describe("pull", () => {
  it("applies only rows newer than the local copy and saves the cursor", async () => {
    const client = fakeClient();
    const local = new Map<string, PullRow>([
      ["task:keep", task("keep", T1, "local wins")],
      ["task:same", task("same", T1)],
    ]);
    const applied: Array<{ table: PullTable; row: PullRow }> = [];
    const cursor = cursorStore();
    client.pull.mockResolvedValue({
      changes: [
        { table: "task", row: task("keep", T0, "older remote") },
        { table: "task", row: task("keep", T1, "same remote") },
        { table: "task", row: task("keep", T2, "newer remote") },
        { table: "task", row: task("fresh", T0) },
      ],
      cursor: 42,
      more: false,
    });
    const engine = new SyncEngine({
      client,
      getLocal: (table, id) => local.get(`${table}:${id}`) ?? null,
      applyRemote: (table, row) => {
        local.set(`${table}:${row.id}`, row);
        applied.push({ table, row });
      },
      cursorStore: cursor,
    });

    await engine.pull();

    expect(applied.map((entry) => entry.row.id)).toEqual(["keep", "fresh"]);
    expect(local.get("task:keep")).toMatchObject({ title: "newer remote" });
    expect(cursor.value()).toBe(42);
    expect(client.pull).toHaveBeenCalledWith(0);
  });

  it("pages through /sync until more is false", async () => {
    const client = fakeClient();
    const since: number[] = [];
    client.pull.mockImplementation(async (value: number) => {
      since.push(value);
      if (value === 0) {
        return {
          changes: [{ table: "task", row: task("p1") }],
          cursor: 10,
          more: true,
        };
      }
      if (value === 10) {
        return {
          changes: [{ table: "task", row: task("p2") }],
          cursor: 20,
          more: true,
        };
      }
      return {
        changes: [{ table: "task", row: task("p3") }],
        cursor: 30,
        more: false,
      };
    });
    const cursor = cursorStore();
    const { engine, applied } = engineFor(client, new Map(), cursor);

    await engine.pull();

    expect(since).toEqual([0, 10, 20]);
    expect(applied.map((entry) => entry.row.id)).toEqual(["p1", "p2", "p3"]);
    expect(cursor.value()).toBe(30);
  });

  it("resumes from the stored cursor", async () => {
    const client = fakeClient();
    const cursor = cursorStore(77);
    const { engine } = engineFor(client, new Map(), cursor);

    await engine.pull();

    expect(client.pull).toHaveBeenCalledWith(77);
  });
});

describe("push failures", () => {
  it("keeps failed ops in the outbox and retries with backoff", async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    let attempts = 0;
    client.push.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("hub down");
      return { applied: 1, cursor: 1 };
    });
    const { engine } = engineFor(client);
    engine.outbox.enqueue(op("task", task("a", T1)));

    await engine.push();
    expect(attempts).toBe(1);
    expect(engine.outbox.size()).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    expect(engine.outbox.size()).toBe(0);
  });
});

describe("lifecycle", () => {
  it("flushes the outbox when the browser comes back online", async () => {
    vi.useFakeTimers();
    const online = new EventTarget();
    const page = Object.assign(new EventTarget(), {
      visibilityState: "visible" as string,
    });
    vi.stubGlobal("window", online);
    vi.stubGlobal("document", page);

    const client = fakeClient();
    let connected = false;
    client.push.mockImplementation(async () => {
      if (!connected) throw new Error("offline");
      return { applied: 1, cursor: 1 };
    });
    const { engine } = engineFor(client);
    engine.start(60_000);
    engine.outbox.enqueue(op("task", task("a", T1)));

    await engine.push();
    expect(client.push).toHaveBeenCalledTimes(1);
    expect(engine.outbox.size()).toBe(1);

    connected = true;
    online.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1);

    expect(client.push).toHaveBeenCalledTimes(2);
    expect(engine.outbox.size()).toBe(0);
    engine.stop();
  });

  it("syncs when the tab becomes visible, but not while hidden", async () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "hidden" as string,
    });
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);

    const client = fakeClient();
    const { engine } = engineFor(client);
    engine.start(60_000);

    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(client.pull).not.toHaveBeenCalled();

    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(client.pull).toHaveBeenCalledTimes(1);

    engine.stop();
  });
});
