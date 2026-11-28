import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultData } from "../domain/model";
import { HEALTH_KEY, parseHealthData, serializeHealthData, type HealthData, type HealthRecord } from "../lib/health";
import type { EventRecord, HealthRow, HubOp, PullResult } from "../storage/hub";
import { SyncController } from "./controller";
import { applyRemoteHealthRow, getLocalHealthRow, HEALTH_REMOTE_EVENT } from "./health-apply";
import type { OutboxStorage } from "./queue";

const DAY = "2026-11-27";
const T0 = "2026-11-27T09:00:00.000Z";
const T1 = "2026-11-27T10:00:00.000Z";
const T2 = "2026-11-27T11:00:00.000Z";

function storage(initial: HealthData = {}): OutboxStorage {
  const map = new Map<string, string>();
  if (Object.keys(initial).length) map.set(HEALTH_KEY, serializeHealthData(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function row(over: Partial<HealthRow> = {}): HealthRow {
  return {
    id: `health_${DAY}`,
    date: DAY,
    activeKcal: 410,
    steps: 8000,
    exerciseMin: 30,
    distanceKm: null,
    sleepHours: null,
    restingHr: 58,
    workouts: [],
    source: "healthkit",
    updatedAt: T1,
    deletedAt: null,
    ...over,
  };
}

function localDay(over: Partial<HealthRecord> = {}): HealthRecord {
  return {
    date: DAY,
    source: "shortcut",
    updatedAt: T0,
    activeKcal: null,
    steps: 5000,
    exerciseMin: null,
    distanceKm: null,
    sleepHours: null,
    restingHr: null,
    workouts: [],
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pulled health rows", () => {
  it("stores a new day in the health provider's existing format", () => {
    const store = storage();
    expect(applyRemoteHealthRow(store, row())).toBe(true);
    const saved = parseHealthData(store.getItem(HEALTH_KEY))[DAY];
    expect(saved).toMatchObject({
      date: DAY,
      source: "healthkit",
      updatedAt: T1,
      activeKcal: 410,
      steps: 8000,
      exerciseMin: 30,
      restingHr: 58,
      workouts: [],
    });
  });

  it("never erases a local value with an absent field", () => {
    const store = storage({ [DAY]: localDay() });
    applyRemoteHealthRow(
      store,
      row({ steps: null, activeKcal: 410, source: "healthkit" }),
    );
    const saved = parseHealthData(store.getItem(HEALTH_KEY))[DAY];
    expect(saved.steps).toBe(5000); // local value kept
    expect(saved.activeKcal).toBe(410);
    expect(saved.updatedAt).toBe(T1);
  });

  it("newest updatedAt wins and a stale row is ignored", () => {
    const store = storage({ [DAY]: localDay({ updatedAt: T2 }) });
    expect(applyRemoteHealthRow(store, row({ updatedAt: T1, steps: 99 }))).toBe(false);
    expect(parseHealthData(store.getItem(HEALTH_KEY))[DAY].steps).toBe(5000);
    expect(applyRemoteHealthRow(store, row({ updatedAt: T2, steps: 99 }))).toBe(false); // equal, not newer

    expect(applyRemoteHealthRow(store, row({ updatedAt: "2026-11-27T12:00:00.000Z", steps: 99 }))).toBe(true);
    expect(parseHealthData(store.getItem(HEALTH_KEY))[DAY].steps).toBe(99);
  });

  it("applies an explicit tombstone and ignores a bad row", () => {
    const store = storage({ [DAY]: localDay() });
    expect(applyRemoteHealthRow(store, row({ deletedAt: T1, date: "not-a-day" }))).toBe(false);
    expect(parseHealthData(store.getItem(HEALTH_KEY))[DAY]).toBeDefined();
    expect(applyRemoteHealthRow(store, row({ deletedAt: T1 }))).toBe(true);
    expect(parseHealthData(store.getItem(HEALTH_KEY))[DAY]).toBeUndefined();
  });

  it("exposes the local row for the engine's last-write-wins check", () => {
    expect(getLocalHealthRow(storage(), `health_${DAY}`)).toBeNull();
    expect(getLocalHealthRow(storage({ [DAY]: localDay() }), `health_${DAY}`)).toMatchObject({
      id: `health_${DAY}`,
      date: DAY,
      updatedAt: T0,
    });
  });

  it("announces the remote write so the provider can re-read the store", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const heard: string[] = [];
    target.addEventListener(HEALTH_REMOTE_EVENT, (event) => {
      heard.push((event as CustomEvent<{ date: string }>).detail.date);
    });
    applyRemoteHealthRow(storage(), row());
    expect(heard).toEqual([DAY]);
  });
});

describe("controller wiring", () => {
  it("applies a pulled health row to local storage without changing AppData", async () => {
    const store = storage({ [DAY]: localDay() });
    let data = defaultData();
    let cursor = 0;
    const pull = vi.fn(
      async (_since?: number): Promise<PullResult> => ({
        changes: [{ table: "health", row: row({ steps: 9000, updatedAt: T2 }) }],
        cursor: 1,
        more: false,
      }),
    );
    const noEvents = { events: [] as EventRecord[], cursor: 0 as number | string, more: false };
    const controller = new SyncController({
      client: {
        push: vi.fn(async (_ops: HubOp[]) => ({ applied: 0, cursor: 0 })),
        pull,
        getEvents: async () => noEvents,
        postCommand: async () => ({ id: "c" }),
        getCommand: async () => null,
      },
      getData: () => data,
      apply: (fn) => {
        data = fn(data);
      },
      storage: store,
      outbox: {
        enqueue: () => {},
        enqueueAll: () => {},
        pending: () => [],
        ack: () => {},
        size: () => 0,
        clear: () => {},
      },
      cursorStore: { get: () => cursor, set: (c) => void (cursor = c) },
      letcode: { addDoneTask: () => {}, toggleTask: () => {} },
      recordHandoff: () => {},
      getLocalHealth: (id) => getLocalHealthRow(store, id),
      applyRemoteHealth: (incoming) => {
        applyRemoteHealthRow(store, incoming);
      },
    });

    await controller.syncNow();
    expect(parseHealthData(store.getItem(HEALTH_KEY))[DAY]).toMatchObject({
      steps: 9000,
      updatedAt: T2,
    });
    expect(data).toEqual(defaultData());
    expect(cursor).toBe(1);
  });
});
