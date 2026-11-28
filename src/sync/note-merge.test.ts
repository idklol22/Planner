import { describe, expect, it } from "vitest";
import { defaultData, makeNote, makeTask, type AppData, type Task } from "../domain/model";
import type { EventRecord, HubOp, PullResult, PullRow, PullTable, TaskRow } from "../storage/hub";
import { SyncController } from "./controller";
import { applyRemoteRow, keepsLocalNote, noteIsNewer, taskToRow } from "./mapping";
import { isNewerRow, LocalOutbox, type OutboxStorage } from "./queue";

const DAY = "2026-11-20";
const T0 = "2026-11-20T09:00:00.000Z";
const T2 = "2026-11-20T10:00:00.000Z";
const T3 = "2026-11-20T11:00:00.000Z";
const NOW = "2026-11-28T00:00:00.000Z";

function note(taskId: string, content: string, updatedAt?: string) {
  const base = makeNote(taskId);
  return {
    ...base,
    content,
    createdAt: T0,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    ...makeTask(DAY, "Task", 0),
    id: "t1",
    createdAt: T0,
    updatedAt: T0,
    note: note("t1", "base", T0),
    ...over,
  };
}

describe("note-level conflict resolution", () => {
  it("keeps a newer local note while applying the other task fields", () => {
    const local = task({ note: note("t1", "newer local text", T2), updatedAt: T2 });
    const remote: TaskRow = {
      ...taskToRow(task({ done: true, completedAt: T3, updatedAt: T3 })),
      title: "Renamed remotely",
    };
    const next = applyRemoteRow({ ...defaultData(), tasks: [local] }, "task", remote, NOW);
    const merged = next.tasks[0];

    expect(merged.note?.content).toBe("newer local text");
    expect(merged.note?.updatedAt).toBe(T2); // the note keeps its own stamp
    expect(merged).toMatchObject({ title: "Renamed remotely", done: true, completedAt: T3 });
    expect(Date.parse(merged.updatedAt)).toBeGreaterThan(Date.parse(remote.updatedAt));
    expect(Date.parse(merged.updatedAt)).toBeGreaterThan(Date.parse(local.updatedAt));
  });

  it("a genuinely newer remote note still replaces the local one", () => {
    const local = task({ note: note("t1", "old local text", T2), updatedAt: T2 });
    const remote: TaskRow = taskToRow(
      task({ note: note("t1", "newest remote text", T3), updatedAt: T3 }),
    );
    const next = applyRemoteRow({ ...defaultData(), tasks: [local] }, "task", remote, NOW);
    expect(next.tasks[0].note?.content).toBe("newest remote text");
    expect(next.tasks[0].updatedAt).toBe(T3);
  });

  it("missing note stamps count as oldest", () => {
    const noStamp = note("t1", "no stamp");
    delete (noStamp as { updatedAt?: string }).updatedAt;
    expect(noteIsNewer(noStamp, note("t1", "stamped", T0))).toBe(false);
    expect(noteIsNewer(note("t1", "stamped", T0), noStamp)).toBe(true);
    expect(noteIsNewer(noStamp, { ...noStamp })).toBe(false); // deterministic tie

    const local = task({ note: note("t1", "stamped local", T2), updatedAt: T2 });
    const remote = taskToRow(task({ note: noStamp, updatedAt: T3 }));
    expect(keepsLocalNote(local, remote)).toBe(true);
  });

  it("a note-less remote row cannot erase the local note, but a delete can", () => {
    const local = task({ note: note("t1", "local", T2), updatedAt: T2 });
    const noNote = taskToRow(task({ note: null, updatedAt: T3 }));
    expect(applyRemoteRow({ ...defaultData(), tasks: [local] }, "task", noNote, NOW).tasks[0].note?.content).toBe("local");

    const deleted = taskToRow(task({ note: null, updatedAt: T3, deletedAt: T3 }));
    const removed = applyRemoteRow({ ...defaultData(), tasks: [local] }, "task", deleted, NOW).tasks[0];
    expect(removed.note).toBeNull();
    expect(removed.deletedAt).toBe(T3);
    expect(removed.updatedAt).toBe(T3);
  });
});

// ── Two devices sharing one last-write-wins hub ────────────────────────────

function memoryStorage(): OutboxStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

class FakeHub {
  private readonly rows = new Map<string, PullRow>();
  private readonly history: Array<{ table: PullTable; row: PullRow }> = [];
  pushes = 0;

  seed(ops: HubOp[]): void {
    this.push(ops);
    this.pushes = 0; // seeding is not a device write
  }

  push(ops: HubOp[]): { applied: number; cursor: number } {
    this.pushes += 1;
    let applied = 0;
    for (const op of ops) {
      const key = `${op.table}:${op.row.id}`;
      const current = this.rows.get(key);
      if (isNewerRow(op.row as PullRow, current)) {
        this.rows.set(key, op.row as PullRow);
        this.history.push({ table: op.table, row: op.row as PullRow });
        applied += 1;
      }
    }
    return { applied, cursor: this.history.length };
  }

  pull(since = 0): PullResult {
    return { changes: this.history.slice(since), cursor: this.history.length, more: false };
  }
}

function device(hub: FakeHub, initial: AppData) {
  let data = initial;
  let cursor = 0;
  const storage = memoryStorage();
  const outbox = new LocalOutbox(storage);
  const noEvents = { events: [] as EventRecord[], cursor: 0 as number | string, more: false };
  const controller = new SyncController({
    client: {
      push: async (ops: HubOp[]) => hub.push(ops),
      pull: async (since?: number) => hub.pull(since),
      getEvents: async () => noEvents,
      postCommand: async () => ({ id: "c" }),
      getCommand: async () => null,
    },
    getData: () => data,
    apply: (fn) => {
      data = fn(data);
    },
    storage,
    outbox,
    cursorStore: { get: () => cursor, set: (c) => void (cursor = c) },
    letcode: { addDoneTask: () => {}, toggleTask: () => {} },
    recordHandoff: () => {},
    now: () => new Date(NOW),
  });
  return {
    controller,
    outbox,
    get data() {
      return data;
    },
    edit(mutate: (t: Task) => Task) {
      const before = data;
      data = { ...data, tasks: data.tasks.map(mutate) };
      controller.handleChange(before, data);
    },
  };
}

describe("two stores converge on a task note conflict", () => {
  it("keeps the newer note on the device that edited it, with no echo", async () => {
    const base = task();
    const hub = new FakeHub();
    hub.seed([{ table: "task", row: taskToRow(base) }]);

    const a = device(hub, { ...defaultData(), tasks: [base] });
    const b = device(hub, { ...defaultData(), tasks: [base] });
    await a.controller.syncNow();
    await b.controller.syncNow();

    // A edits the note; B toggles the task later but with an older note stamp.
    a.edit((t) => ({ ...t, note: note("t1", "A's text", T2), updatedAt: T2 }));
    b.edit((t) => ({ ...t, done: true, completedAt: T3, updatedAt: T3 }));
    await b.controller.syncNow(); // B's toggle lands on the hub first

    // A pulls the toggle, repairs the row and pushes the merged result.
    await a.controller.engine.pull();
    expect(a.data.tasks[0]).toMatchObject({ done: true, note: { content: "A's text" } });
    expect(Date.parse(a.data.tasks[0].updatedAt)).toBeGreaterThan(Date.parse(T3));
    await a.controller.syncNow();
    await b.controller.syncNow();

    // B sees the repaired note. Simulate the React effect that feeds the outbox.
    b.controller.handleChange({ ...defaultData(), tasks: [task()] }, b.data);
    a.controller.handleChange({ ...defaultData(), tasks: [task()] }, a.data);
    expect(a.data.tasks[0]).toEqual(b.data.tasks[0]);
    expect(a.outbox.size()).toBe(0);
    expect(b.outbox.size()).toBe(0);

    const pushes = hub.pushes;
    await a.controller.syncNow();
    await b.controller.syncNow();
    expect(hub.pushes).toBe(pushes); // no endless echo
    expect(a.data.tasks[0]).toEqual(b.data.tasks[0]);
  });
});
