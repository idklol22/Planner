import { describe, expect, it } from "vitest";
import { defaultData, makeCalorieEntry, makeCategory, makeHabit, makeTask } from "../domain/model";
import { DATA_KEY } from "./local";
import type { RecoveryStorage } from "./recovery";
import { BACKUP_KEY, QUARANTINE_PREFIX, planRecovery, readBackup, recoverStored } from "./recovery";

function memoryStorage(initial: Record<string, string> = {}): RecoveryStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

const SETTINGS = { handoffFolder: "/notes", learnharnessSubjects: ["Bio"], dailyCalorieGoal: 2200 };
const goodTask = () => ({ ...makeTask("2026-11-20", "Good", 0), id: "good" });
const badTask = () => ({ ...makeTask("2026-11-20", "Bad", 1), id: "bad", title: 42 });
const v4 = () => ({
  version: 4,
  tasks: [goodTask(), badTask()],
  categories: [makeCategory("Study", 0)],
  habits: [makeHabit("Run", null, "2026-11-20")],
  calories: [makeCalorieEntry("2026-11-20", 300)],
  goals: [],
  settings: SETTINGS,
});

describe("per-record loading", () => {
  it("keeps every valid record and quarantines the damaged one verbatim", () => {
    const stored = v4();
    const storage = memoryStorage();
    const result = recoverStored(JSON.stringify(stored), storage);

    expect(result.data?.tasks.map((t) => t.id)).toEqual(["good"]);
    expect(result.data?.categories).toHaveLength(1);
    expect(result.data?.habits).toHaveLength(1);
    expect(result.data?.calories).toHaveLength(1);
    expect(result.issue).toMatchObject({ reason: "partial", dropped: 1 });

    const [key] = result.issue!.quarantinedKeys;
    expect(key).toContain(QUARANTINE_PREFIX);
    expect(key).toContain("bad");
    expect(JSON.parse(storage.getItem(key)!)).toEqual(stored.tasks[1]);
    // The original is backed up before any save can replace it.
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(JSON.stringify(stored));
  });

  it("falls back one invalid settings field without touching the others", () => {
    const stored = { ...v4(), tasks: [], settings: { ...SETTINGS, dailyCalorieGoal: "oops", dailyProteinGoal: 120 } };
    const result = recoverStored(JSON.stringify(stored), memoryStorage());

    expect(result.data?.settings).toMatchObject({
      handoffFolder: "/notes",
      learnharnessSubjects: ["Bio"],
      dailyCalorieGoal: defaultData().settings.dailyCalorieGoal,
      dailyProteinGoal: 120,
    });
    expect(result.issue?.repairedSettings).toEqual(["dailyCalorieGoal"]);
  });

  it("quarantines independently per record, not just per file", () => {
    const stored = {
      ...v4(),
      tasks: [badTask(), { ...badTask(), id: "bad-2", title: null }],
      calories: [{ ...makeCalorieEntry("2026-11-20", NaN), id: "broken-meal" }],
    };
    const storage = memoryStorage();
    const result = recoverStored(JSON.stringify(stored), storage);
    expect(result.issue?.dropped).toBe(3);
    expect(new Set(result.issue?.quarantinedKeys).size).toBe(3);
    for (const key of result.issue!.quarantinedKeys) expect(storage.getItem(key)).toBeTruthy();
  });
});

describe("unreadable stores", () => {
  it("backs up truncated JSON and reports it once instead of silently resetting", () => {
    const raw = '{"version":4,"tasks":[';
    const storage = memoryStorage();
    const result = recoverStored(raw, storage);
    expect(result.data).toBeNull();
    expect(result.issue).toMatchObject({ reason: "unreadable", dropped: 0 });
    expect(readBackup(storage.getItem(BACKUP_KEY))).toMatchObject({ raw, quality: "unreadable" });
    expect([...storage.values.keys()].filter((k) => k.startsWith(QUARANTINE_PREFIX))).toEqual([]);
  });

  it("backs up readable-but-unknown data too", () => {
    const raw = JSON.stringify({ nonsense: true });
    const storage = memoryStorage();
    const result = recoverStored(raw, storage);
    expect(result.issue?.reason).toBe("unreadable");
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(raw);
  });

  it("a first run has nothing to recover", () => {
    const storage = memoryStorage();
    expect(recoverStored(null, storage)).toEqual({ data: null, issue: null });
    expect(storage.values.size).toBe(0);
  });
});

describe("older versions and migrations", () => {
  it("loads a valid v3 file with no recovery notice", () => {
    const { goals: _goals, ...rest } = defaultData();
    const raw = JSON.stringify({ ...rest, version: 3, tasks: [goodTask()] });
    const storage = memoryStorage();
    const result = recoverStored(raw, storage);
    expect(result.data?.version).toBe(4);
    expect(result.data?.tasks.map((t) => t.id)).toEqual(["good"]);
    expect(result.issue).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });

  it("salvages a damaged record out of an old-version file", () => {
    const { goals: _goals, ...rest } = defaultData();
    const raw = JSON.stringify({ ...rest, version: 3, tasks: [goodTask(), badTask()] });
    const storage = memoryStorage();
    const result = recoverStored(raw, storage);
    expect(result.data?.tasks.map((t) => t.id)).toEqual(["good"]);
    expect(result.issue?.dropped).toBe(1);
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(raw);
  });
});

describe("backups survive later writes and are never made worse", () => {
  it("a following save writes current data without destroying the original backup", () => {
    const raw = JSON.stringify(v4());
    const storage = memoryStorage();
    recoverStored(raw, storage);
    storage.setItem(DATA_KEY, JSON.stringify(defaultData()));
    expect(storage.getItem(DATA_KEY)).not.toBe(raw);
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(raw);
  });

  it("keeps the earliest usable backup when a later load is unreadable", () => {
    const backup = JSON.stringify({ version: 1, raw: '{"good":true}', quality: "partial", at: "t0" });
    const storage = memoryStorage({ [BACKUP_KEY]: backup });
    recoverStored('{"broken":', storage);
    expect(storage.getItem(BACKUP_KEY)).toBe(backup);
  });

  it("keeps an existing partial backup when another partial store is loaded", () => {
    const backup = JSON.stringify({ version: 1, raw: "first", quality: "partial", at: "t0" });
    const storage = memoryStorage({ [BACKUP_KEY]: backup });
    recoverStored(JSON.stringify(v4()), storage);
    expect(storage.getItem(BACKUP_KEY)).toBe(backup);
  });

  it("replaces an unreadable backup with a salvageable original", () => {
    const backup = JSON.stringify({ version: 1, raw: "garbage", quality: "unreadable", at: "t0" });
    const storage = memoryStorage({ [BACKUP_KEY]: backup });
    const raw = JSON.stringify(v4());
    recoverStored(raw, storage);
    expect(readBackup(storage.getItem(BACKUP_KEY))).toMatchObject({ raw, quality: "partial" });
  });

  it("planRecovery does not propose overwriting an equal backup", () => {
    const backup = JSON.stringify({ version: 1, raw: "first", quality: "partial", at: "t0" });
    expect(planRecovery(JSON.stringify(v4()), backup).backup).toBeNull();
  });
});
