import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultData, makeTask } from "../domain/model";
import { DATA_KEY, localAdapter } from "./local";
import { BACKUP_KEY, QUARANTINE_PREFIX, readBackup, recoverStored, retrySafetyCopies } from "./recovery";
import { clearPlannerLocalData } from "./reset";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const blocked = new Set<string>();
  const blockedPrefixes = new Set<string>();
  const silent = new Set<string>();
  return {
    map,
    blocked,
    blockedPrefixes,
    silent,
    get length() {
      return map.size;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (blocked.has(key) || [...blockedPrefixes].some((p) => key.startsWith(p))) {
        throw new Error("QuotaExceededError");
      }
      if (silent.has(key)) return;
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

const damaged = () => ({
  ...defaultData(),
  tasks: [
    { ...makeTask("2026-11-20", "Good", 0), id: "good" },
    { ...makeTask("2026-11-20", "Bad", 1), id: "bad", title: 42 },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safety copies gate saves", () => {
  it("does not save over the original when the backup copy cannot be written", async () => {
    const raw = JSON.stringify(damaged());
    const storage = fakeStorage({ [DATA_KEY]: raw });
    storage.blocked.add(BACKUP_KEY);
    vi.stubGlobal("localStorage", storage);

    const result = recoverStored(raw, storage);
    expect(result.blocked).toBe(true);
    expect(result.data?.tasks.map((t) => t.id)).toEqual(["good"]);
    await expect(localAdapter.save(defaultData())).rejects.toThrow();
    expect(storage.getItem(DATA_KEY)).toBe(raw);

    // Storage frees up: the next save retries the copy and only then writes.
    storage.blocked.delete(BACKUP_KEY);
    await localAdapter.save(defaultData());
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(raw);
    expect(storage.getItem(DATA_KEY)).not.toBe(raw);
  });

  it("does not save over the original when a quarantined record cannot be written", async () => {
    const raw = JSON.stringify(damaged());
    const storage = fakeStorage({ [DATA_KEY]: raw });
    storage.blockedPrefixes.add(QUARANTINE_PREFIX);
    vi.stubGlobal("localStorage", storage);

    const result = recoverStored(raw, storage);
    expect(result.blocked).toBe(true);
    expect(result.issue?.quarantinedKeys).toHaveLength(1);
    await expect(localAdapter.save(defaultData())).rejects.toThrow();
    expect(storage.getItem(DATA_KEY)).toBe(raw);

    storage.blockedPrefixes.delete(QUARANTINE_PREFIX);
    await expect(localAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(storage.getItem(result.issue!.quarantinedKeys[0])).toBeTruthy();
    expect(storage.getItem(DATA_KEY)).not.toBe(raw);
  });

  it("verifies copies by reading them back, not by trusting setItem", async () => {
    const raw = JSON.stringify(damaged());
    const storage = fakeStorage({ [DATA_KEY]: raw });
    // setItem silently drops the write, as a full WebView store can.
    storage.silent.add(BACKUP_KEY);
    vi.stubGlobal("localStorage", storage);

    expect(recoverStored(raw, storage).blocked).toBe(true);
    await expect(localAdapter.save(defaultData())).rejects.toThrow();
    expect(storage.getItem(DATA_KEY)).toBe(raw);

    storage.silent.delete(BACKUP_KEY);
    expect(retrySafetyCopies(storage)).toBe(true);
    await expect(localAdapter.save(defaultData())).resolves.toBeUndefined();
  });

  it("holds saves for a whole-store copy when an older backup already exists", async () => {
    const raw = '{"version":4,"tasks":[{"id":"t1","title":"keep me"';
    const earlier = JSON.stringify({ version: 1, raw: '{"earlier":true}', quality: "partial", at: "t0" });
    const storage = fakeStorage({ [DATA_KEY]: raw, [BACKUP_KEY]: earlier });
    storage.blockedPrefixes.add(QUARANTINE_PREFIX);
    vi.stubGlobal("localStorage", storage);

    const result = recoverStored(raw, storage);
    expect(result.issue?.reason).toBe("unreadable");
    expect(result.blocked).toBe(true);
    await expect(localAdapter.save(defaultData())).rejects.toThrow();
    expect(storage.getItem(DATA_KEY)).toBe(raw);
    expect(storage.getItem(BACKUP_KEY)).toBe(earlier);

    storage.blockedPrefixes.delete(QUARANTINE_PREFIX);
    await expect(localAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(storage.getItem(DATA_KEY)).not.toBe(raw);
    expect(storage.getItem(BACKUP_KEY)).toBe(earlier);
  });

  it("holds saves when the storage cannot even be read for verification", async () => {
    const raw = JSON.stringify(damaged());
    const storage = fakeStorage({ [DATA_KEY]: raw });
    storage.blocked.add(BACKUP_KEY);
    // A blocked backup read must not be mistaken for "no backup".
    const originalGet = storage.getItem.bind(storage);
    storage.getItem = (key: string) => {
      if (key === BACKUP_KEY && storage.blocked.has(key)) throw new Error("blocked read");
      return originalGet(key);
    };
    vi.stubGlobal("localStorage", storage);

    expect(recoverStored(raw, storage).blocked).toBe(true);
    await expect(localAdapter.save(defaultData())).rejects.toThrow();
    expect(storage.getItem(DATA_KEY)).toBe(raw);
  });

  it("leaves normal loads, saves and first runs unblocked", async () => {
    const clean = fakeStorage();
    vi.stubGlobal("localStorage", clean);
    expect(recoverStored(null, clean)).toEqual({ data: null, issue: null });
    await expect(localAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(clean.getItem(DATA_KEY)).toBe(JSON.stringify(defaultData()));

    const raw = JSON.stringify(defaultData());
    const good = fakeStorage({ [DATA_KEY]: raw });
    vi.stubGlobal("localStorage", good);
    expect(recoverStored(raw, good).blocked).toBeUndefined();
    await expect(localAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(good.getItem(DATA_KEY)).toBe(JSON.stringify(defaultData()));
  });

  it("reset cannot delete the original while a safety copy is still missing", async () => {
    const raw = JSON.stringify(damaged());
    const storage = fakeStorage({ [DATA_KEY]: raw, "planner.theme": "keep" });
    storage.blocked.add(BACKUP_KEY);
    vi.stubGlobal("localStorage", storage);
    recoverStored(raw, storage);

    clearPlannerLocalData(storage);
    expect(storage.getItem(DATA_KEY)).toBe(raw);
    // Settings are still cleared/kept by the same rules as an ordinary reset.
    expect(storage.getItem("planner.theme")).toBe("keep");

    storage.blocked.delete(BACKUP_KEY);
    expect(retrySafetyCopies(storage)).toBe(true);
    const removed = clearPlannerLocalData(storage);
    expect(removed).toContain(DATA_KEY);
    expect(storage.getItem(DATA_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });
});
