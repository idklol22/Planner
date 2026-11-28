import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultData, makeTask } from "../domain/model";
import { BACKUP_KEY, readBackup } from "./recovery";
import { resetTauriReadState, tauriAdapter } from "./tauri";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const blocked = new Set<string>();
  return {
    map,
    blocked,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (blocked.has(k)) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

const damaged = () =>
  JSON.stringify({
    ...defaultData(),
    tasks: [{ ...makeTask("2026-11-20", "Bad", 0), title: 42 }],
  });

beforeEach(() => {
  invoke.mockReset();
  resetTauriReadState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native read failures", () => {
  it("never saves defaults over a store that could not be read", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_store") throw new Error("disk busy");
      return "/tmp/note.md";
    });

    const report = await tauriAdapter.loadWithReport!();
    expect(report.readFailed).toBe(true);
    expect(report.blocked).toBe(true);
    expect(report.data).toBeNull();
    // Nothing was invented as a backup and nothing was written.
    expect(storage.getItem(BACKUP_KEY)).toBeNull();

    await expect(tauriAdapter.save(defaultData())).rejects.toMatchObject({ reason: "read" });
    expect(invoke).not.toHaveBeenCalledWith("write_store", expect.anything());
  });

  it("retries the read, then holds saves until the recovered data has a safety copy", async () => {
    const raw = damaged();
    const storage = fakeStorage();
    storage.blocked.add(BACKUP_KEY);
    vi.stubGlobal("localStorage", storage);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_store") throw new Error("disk busy");
      return "/tmp/note.md";
    });

    await tauriAdapter.loadWithReport!();
    invoke.mockImplementation(async (cmd: string, args?: { contents?: string }) => {
      if (cmd === "read_store") return raw;
      if (cmd === "write_store") {
        return `/tmp/${args?.contents?.length ?? 0}`;
      }
      return "/tmp/note.md";
    });

    const retry = await tauriAdapter.retryLoad!();
    expect(retry.readFailed).toBeUndefined();
    expect(retry.blocked).toBe(true);
    expect(retry.data?.tasks).toHaveLength(0);
    await expect(tauriAdapter.save(defaultData())).rejects.toMatchObject({ reason: "backup" });
    expect(invoke).not.toHaveBeenCalledWith("write_store", expect.anything());

    storage.blocked.delete(BACKUP_KEY);
    const nextRetry = await tauriAdapter.retryLoad!();
    expect(nextRetry.blocked).toBeUndefined();
    expect(readBackup(storage.getItem(BACKUP_KEY))?.raw).toBe(raw);
    await expect(tauriAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("write_store", { contents: JSON.stringify(defaultData()) });
  });

  it("a diagnostic save never opens the write gate for a later flush", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    let readFails = true;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "read_store") {
        if (readFails) throw new Error("disk busy");
        return damaged();
      }
      return "/tmp/note.md";
    });

    await tauriAdapter.loadWithReport!();
    await expect(tauriAdapter.save(defaultData())).rejects.toMatchObject({ reason: "read" });

    // The disk recovered, but nobody has reloaded its contents yet: a second
    // background flush must still not write defaults over the real store.
    readFails = false;
    await expect(tauriAdapter.save(defaultData())).rejects.toMatchObject({ reason: "read" });
    expect(invoke).not.toHaveBeenCalledWith("write_store", expect.anything());

    // Only after the store adopts a fresh read may saving resume.
    await tauriAdapter.retryLoad!();
    await expect(tauriAdapter.save(defaultData())).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("write_store", expect.anything());
  });
});
