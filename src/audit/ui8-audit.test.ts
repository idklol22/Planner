/** Adversarial checks for the three ui8 fixes. Each test describes a concrete
 *  way a user could lose data or get stuck; they are written against the code
 *  as merged, so they fail before the audit fixes are applied. */

import { describe, expect, it } from "vitest";
import {
  calorieOutsideTapDecision,
  noCalorieTap,
  type CalorieTapDecision,
} from "../components/calorieOutsideTap";
import { defaultData, makeTask } from "../domain/model";
import { DATA_KEY } from "../storage/local";
import type { HubOp, PullRow, TaskRow } from "../storage/hub";
import { BACKUP_KEY, recoverStored, retrySafetyCopies } from "../storage/recovery";
import { clearPlannerLocalData, RESET_KEYS } from "../storage/reset";
import {
  CONFLICTS_KEY,
  describeConflicts,
  LocalConflictStore,
  type ConflictRecord,
} from "../sync/conflicts";
import { SyncEngine, type CursorStore, type SyncEngineOptions } from "../sync/engine";
import { FakeHub } from "../sync/fake-hub";
import { LocalOutbox } from "../sync/queue";

/** The extra argument is added by the audit fix; the cast lets this test run
 *  against the unmerged implementation too. */
const tapWithDiscard = calorieOutsideTapDecision as unknown as (
  formOpen: boolean,
  typed: boolean,
  keyboardUp: boolean,
  keepTap: boolean,
  discard: boolean,
) => CalorieTapDecision;

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    failBackupRead: false,
    get length() {
      return map.size;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    getItem(key: string) {
      if (key === BACKUP_KEY && this.failBackupRead) throw new Error("blocked read");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

const damaged = () => ({
  ...defaultData(),
  tasks: [{ ...makeTask("2026-11-20", "Damaged", 0), title: 42 }],
});

describe("the calorie form must not save behind Cancel's back", () => {
  it("treats a Cancel control as a discard, not an outside save", () => {
    expect(tapWithDiscard(true, true, true, true, true)).toEqual(noCalorieTap);
  });
});

describe("storage safety copies", () => {
  it("never replaces an existing backup with a fabricated marker when its read fails", () => {
    const raw = JSON.stringify(damaged());
    const earlier = JSON.stringify({ version: 1, raw: '{"earlier":true}', quality: "partial", at: "t0" });
    const storage = fakeStorage({ [DATA_KEY]: raw, [BACKUP_KEY]: earlier });

    storage.failBackupRead = true;
    expect(recoverStored(raw, storage).blocked).toBe(true);

    // The original backup is still there once reads work again; the gate can
    // then let saves resume without ever having written over it.
    storage.failBackupRead = false;
    expect(storage.getItem(BACKUP_KEY)).toBe(earlier);
    expect(retrySafetyCopies(storage)).toBe(true);
  });
});

describe("reset clears every local backup", () => {
  it("includes sync conflict copies in Reset all data", () => {
    expect(RESET_KEYS).toContain(CONFLICTS_KEY);
    const storage = fakeStorage({ [CONFLICTS_KEY]: '[{"table":"task"}]' });
    clearPlannerLocalData(storage);
    expect(storage.getItem(CONFLICTS_KEY)).toBeNull();
  });
});

const T0 = "2026-11-20T09:00:00.000Z";
const T2 = "2026-11-20T11:00:00.000Z";
const T3 = "2026-11-20T12:00:00.000Z";

function task(id: string, updatedAt: string, note: TaskRow["note"]): TaskRow {
  return {
    id,
    title: `Task ${id}`,
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
    note,
    createdAt: T0,
    updatedAt,
    deletedAt: null,
    archivedAt: null,
  };
}

describe("sync conflict reports", () => {
  it("does not cry conflict when the newer hub row's note was merged back locally", async () => {
    const hub = new FakeHub();
    const sent = task("a", T2, { content: "My note", updatedAt: T2 });
    const winning = task("a", T3, { content: "Old note", updatedAt: T0 });
    hub.seed({ table: "task", row: winning } satisfies HubOp);

    const storage = fakeStorage();
    const outbox = new LocalOutbox(storage);
    const conflicts = new LocalConflictStore(storage);
    const local = new Map<string, PullRow>([[`task:a`, sent]]);
    let cursor = 0;
    const cursorStore: CursorStore = { get: () => cursor, set: (n) => void (cursor = n) };
    const reported: ConflictRecord[][] = [];
    const engine = new SyncEngine({
      client: { push: hub.push, pull: hub.pull },
      getLocal: (table, id) => local.get(`${table}:${id}`) ?? null,
      // Mirror the controller's note merge: newer local note survives the pull.
      applyRemote: (table, row) => {
        const merged = table === "task" ? { ...row, note: sent.note } : row;
        local.set(`${table}:${row.id}`, merged as PullRow);
      },
      cursorStore,
      outbox,
      conflicts,
      onConflicts: (records) => void reported.push(records),
    } satisfies SyncEngineOptions);
    outbox.enqueue({ table: "task", row: sent } satisfies HubOp);

    await engine.push();

    expect(local.get("task:a")).toMatchObject({ note: sent.note });
    expect(conflicts.all()).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("still reports a real loss when the note was not the disputed field", async () => {
    const hub = new FakeHub();
    const note = { content: "Same note", updatedAt: T0 };
    const sent = { ...task("a", T2, note), title: "My title" };
    const winning = { ...task("a", T3, note), title: "Other device" };
    hub.seed({ table: "task", row: winning } satisfies HubOp);

    const storage = fakeStorage();
    const outbox = new LocalOutbox(storage);
    const conflicts = new LocalConflictStore(storage);
    const local = new Map<string, PullRow>([[`task:a`, sent]]);
    let cursor = 0;
    const reported: ConflictRecord[][] = [];
    const engine = new SyncEngine({
      client: { push: hub.push, pull: hub.pull },
      getLocal: (table, id) => local.get(`${table}:${id}`) ?? null,
      applyRemote: (table, row) => void local.set(`${table}:${row.id}`, row),
      cursorStore: { get: () => cursor, set: (n) => void (cursor = n) },
      outbox,
      conflicts,
      onConflicts: (records) => void reported.push(records),
    } satisfies SyncEngineOptions);
    outbox.enqueue({ table: "task", row: sent } satisfies HubOp);

    await engine.push();

    expect(conflicts.all()).toHaveLength(1);
    expect(reported).toHaveLength(1);
  });

  it("admits when a conflict copy could not be written and never lies about it", () => {
    const store = new LocalConflictStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    const record = { table: "task" as const, row: task("a", T2, null), reason: "superseded" as const };
    expect(store.save([record])).toBe(false);

    const describe = describeConflicts as unknown as (
      records: ConflictRecord[],
      kept?: boolean,
    ) => string;
    const full = [{ ...record, savedAt: T3 }] satisfies ConflictRecord[];
    expect(describe(full)).toContain("kept");
    expect(describe(full, false)).not.toContain("copy was kept");
    expect(describe(full, false)).toContain("No copy");
  });
});
