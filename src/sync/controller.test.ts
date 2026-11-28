import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultData,
  makeCalorieEntry,
  makeCategory,
  makeNote,
  makeTask,
  type AppData,
  type Task,
} from "../domain/model";
import type { EventRecord, HubOp, PullResult } from "../storage/hub";
import { MIRROR_KEY, SyncController } from "./controller";
import type { CursorStore } from "./engine";
import { taskToRow } from "./mapping";
import { LocalOutbox, type OutboxStorage } from "./queue";
import { mirrorSubjects, sortMaterials } from "./mirror-view";

const TODAY = "2026-11-20";

function memoryStorage(): OutboxStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function setup(initial: AppData = defaultData()) {
  let data = initial;
  let cursor = 0;
  const storage = memoryStorage();
  const outbox = new LocalOutbox(storage);
  const cursorStore: CursorStore = { get: () => cursor, set: (c) => void (cursor = c) };
  const client = {
    push: vi.fn(async (_ops: HubOp[]) => ({ applied: 0, cursor: 0 })),
    pull: vi.fn(
      async (_since?: number): Promise<PullResult> => ({ changes: [], cursor: 0, more: false }),
    ),
    getEvents: vi.fn(async (_since: number | string) => ({
      events: [] as EventRecord[],
      cursor: 0 as number | string,
      more: false,
    })),
    postCommand: vi.fn(async (_type: string, _payload: unknown) => ({ id: "cmd-1" })),
    getCommand: vi.fn(async (_id: string): Promise<null | { id: string; type: string; payload: unknown; status: "queued" | "claimed" | "done" | "failed"; result: unknown }> => null),
  };
  const letcode = {
    addDoneTask: vi.fn((categoryId: string, title: string, date: string) => {
      data = {
        ...data,
        tasks: [...data.tasks, { ...makeTask(date, title, 0), categoryId, done: true, kind: "practice" as const }],
      };
    }),
    toggleTask: vi.fn((id: string) => {
      data = { ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) };
    }),
  };
  const recordHandoff = vi.fn();
  const controller = new SyncController({
    client,
    getData: () => data,
    apply: (fn) => {
      data = fn(data);
    },
    storage,
    outbox,
    cursorStore,
    letcode,
    recordHandoff,
    today: () => TODAY,
  });
  return {
    controller,
    client,
    letcode,
    recordHandoff,
    outbox,
    storage,
    get data() {
      return data;
    },
    set data(next: AppData) {
      data = next;
    },
    get cursor() {
      return cursor;
    },
  };
}

function solvedEvent(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "e1",
    type: "practice.solved",
    source: "letcode",
    origin: null,
    payload: { problemId: 1, title: "Two Sum" },
    ts: "2026-11-20T10:00:00.000Z",
    idempotencyKey: "k1",
    ...over,
  };
}

describe("sync status", () => {
  it("clears a stale push error once a later sync succeeds with an empty outbox", async () => {
    const s = setup();
    s.outbox.enqueue({ table: "task", row: taskToRow(makeTask(TODAY, "Queued", 0)) });
    s.client.push.mockRejectedValueOnce(new Error("offline"));
    s.client.pull.mockRejectedValueOnce(new Error("offline"));
    await s.controller.syncNow();
    expect(s.controller.status.error).toBe("offline");

    // The next sync has nothing to push and a healthy pull: no client call can
    // clear the sticky error unless syncNow resets it itself.
    s.outbox.clear();
    await s.controller.syncNow();
    expect(s.controller.status.error).toBeNull();
    expect(s.controller.status.lastSyncedAt).toBeTruthy();
    s.controller.stop();
  });
});

describe("local mutations feed the outbox", () => {
  it("queues task, category and meal ops, one per changed record", () => {
    const s = setup();
    const before = s.data;
    const category = makeCategory("Daily", 0);
    const task = makeTask(TODAY, "Read", 0);
    const meal = makeCalorieEntry(TODAY, 300, "Lunch");
    const after: AppData = { ...before, categories: [category], tasks: [task], calories: [meal] };

    s.controller.handleChange(before, after);

    const ops = s.outbox.pending();
    expect(ops.map((o) => o.table).sort()).toEqual(["category", "meal", "task"]);
    expect(ops.find((o) => o.table === "task")?.row.id).toBe(task.id);
    expect(s.controller.status.pending).toBe(3);

    // Unchanged records are not re-queued.
    s.outbox.clear();
    s.controller.handleChange(after, { ...after, tasks: [{ ...task, title: "Read more", updatedAt: "2099-01-01T00:00:00.000Z" }] });
    expect(s.outbox.pending().map((o) => o.table)).toEqual(["task"]);
  });
});

describe("remote rows", () => {
  it("merges pulled rows into local data without echoing them back", async () => {
    const s = setup();
    const remote = { ...makeTask(TODAY, "From phone", 0), updatedAt: "2026-11-20T09:00:00.000Z" };
    s.client.pull.mockResolvedValueOnce({
      changes: [{ table: "task", row: taskToRow(remote) }],
      cursor: 7,
      more: false,
    });

    await s.controller.syncNow();

    expect(s.data.tasks.map((t) => t.title)).toEqual(["From phone"]);
    expect(s.cursor).toBe(7);
    expect(s.controller.status.lastSyncedAt).not.toBeNull();

    s.controller.handleChange(defaultData(), s.data);
    expect(s.outbox.size()).toBe(0);
  });

  it("keeps hub-less local fields when a remote row replaces a task", async () => {
    const local: Task = { ...makeTask(TODAY, "Old", 0), habitId: "habit_1", updatedAt: "2026-11-19T00:00:00.000Z" };
    const s = setup({ ...defaultData(), tasks: [local] });
    s.client.pull.mockResolvedValueOnce({
      changes: [{ table: "task", row: taskToRow({ ...local, title: "New", updatedAt: "2026-11-20T00:00:00.000Z" }) }],
      cursor: 1,
      more: false,
    });
    await s.controller.syncNow();
    expect(s.data.tasks[0]).toMatchObject({ title: "New", habitId: "habit_1" });
  });

  it("lands h_* rows in the read-only mirror, not in app data", async () => {
    const s = setup();
    const subject = { id: "sub1", name: "Algorithms", color: "#fff", order: 0, updatedAt: "2026-11-20T00:00:00.000Z" };
    s.client.pull.mockResolvedValueOnce({
      changes: [{ table: "h_subject", row: subject }],
      cursor: 1,
      more: false,
    });
    await s.controller.syncNow();
    expect(s.controller.mirror.subjects).toEqual([subject]);
    expect(s.data).toEqual(defaultData());
    expect(s.storage.getItem(MIRROR_KEY)).toContain("Algorithms");
    expect(mirrorSubjects(s.controller.mirror)[0]).toMatchObject({ id: "sub1", name: "Algorithms", topics: [] });

    s.client.pull.mockResolvedValueOnce({
      changes: [{ table: "h_subject", row: { ...subject, updatedAt: "2026-11-21T00:00:00.000Z", deletedAt: "2026-11-21T00:00:00.000Z" } }],
      cursor: 2,
      more: false,
    });
    await s.controller.syncNow();
    expect(s.controller.mirror.subjects).toEqual([]);
  });

  it("pushes the outbox during syncNow", async () => {
    const s = setup();
    const task = makeTask(TODAY, "Up", 0);
    s.controller.handleChange(defaultData(), { ...defaultData(), tasks: [task] });
    await s.controller.syncNow();
    expect(s.client.push).toHaveBeenCalledTimes(1);
    expect(s.outbox.size()).toBe(0);
  });
});

describe("hub-mode note hand-off", () => {
  it("enqueues a harness.note command", async () => {
    const s = setup();
    const note = {
      externalId: "t1",
      subjectId: "sub1",
      title: "Lecture",
      date: TODAY,
      markdown: "# hi",
      finished: true,
    };
    await expect(s.controller.sendNote(note)).resolves.toBe("cmd-1");
    expect(s.client.postCommand).toHaveBeenCalledWith("harness.note", note);
  });

  it("tracks the command status onto the task note", async () => {
    const task: Task = {
      ...makeTask(TODAY, "Lecture", 0),
      note: { ...makeNote("t1"), handoff: { status: "ready", commandId: "cmd-1", commandStatus: "queued" } },
    };
    const s = setup({ ...defaultData(), tasks: [task] });
    expect(s.controller.hasOpenCommands()).toBe(true);

    s.client.getCommand.mockResolvedValueOnce(null);
    await s.controller.trackCommands();
    expect(s.recordHandoff).not.toHaveBeenCalled();

    s.client.getCommand.mockResolvedValueOnce({ id: "cmd-1", type: "harness.note", payload: {}, status: "claimed", result: null });
    await s.controller.trackCommands();
    expect(s.recordHandoff).toHaveBeenLastCalledWith(task.id, { commandStatus: "claimed" });

    s.client.getCommand.mockResolvedValueOnce({ id: "cmd-1", type: "harness.note", payload: {}, status: "done", result: {} });
    await s.controller.trackCommands();
    expect(s.recordHandoff).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: "sent", commandStatus: "done" }));

    s.client.getCommand.mockResolvedValueOnce({ id: "cmd-1", type: "harness.note", payload: {}, status: "failed", result: { error: "no subject" } });
    await s.controller.trackCommands();
    expect(s.recordHandoff).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: "failed", error: "no subject" }));
  });
});

describe("LetCode during sync", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    const daily = makeCategory("Daily", 0);
    s = setup({ ...defaultData(), categories: [daily] });
    s.client.getEvents.mockResolvedValue({ events: [solvedEvent()], cursor: 5, more: false });
  });

  it("adds a finished task once, even across repeated syncs", async () => {
    await s.controller.syncNow();
    expect(s.letcode.addDoneTask).toHaveBeenCalledTimes(1);
    expect(s.letcode.addDoneTask).toHaveBeenCalledWith(s.data.categories[0].id, "LC 1 · Two Sum", TODAY);

    await s.controller.syncNow();
    expect(s.letcode.addDoneTask).toHaveBeenCalledTimes(1);
    expect(s.client.getEvents).toHaveBeenLastCalledWith(5);
  });

  it("ticks the matching open task instead of adding one", async () => {
    const match = makeTask(TODAY, "LC 1 Two Sum", 0);
    s.data = { ...s.data, tasks: [match] };
    await s.controller.syncNow();
    expect(s.letcode.toggleTask).toHaveBeenCalledWith(match.id);
    expect(s.letcode.addDoneTask).not.toHaveBeenCalled();
    expect(s.data.tasks[0].done).toBe(true);
  });
});

describe("library ordering", () => {
  it("sorts by lecture number, then date", () => {
    const base = { subjectId: "s", topicId: null, fileName: "f", kind: "pdf" as const, sha256: "x", pageCount: 1, addedAt: "2026-01-01", updatedAt: "2026-01-01" };
    const sorted = sortMaterials([
      { ...base, id: "c", title: "C", lecture: "10", date: null },
      { ...base, id: "a", title: "A", lecture: "2", date: null },
      { ...base, id: "n", title: "N", lecture: null, date: "2026-02-01" },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["a", "c", "n"]);
  });
});
