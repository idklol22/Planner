import { describe, expect, it } from "vitest";
import { clearPlannerLocalData, KEPT_KEYS_EXAMPLE, RESET_KEYS } from "./reset";

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  };
}

describe("reset all data", () => {
  it("lists every planner data, sync and LetCode key", () => {
    expect([...RESET_KEYS].sort()).toEqual(
      [
        "planner.cursor.v1",
        "planner.lastSynced.v1",
        "planner.letcode.cursor.v1",
        "planner.letcode.seen.v1",
        "planner.mirror.v1",
        "planner.outbox.v1",
        "todomate.data",
      ].sort(),
    );
  });
  it("clears data, outbox, cursor, mirror, letcode keys and hand-offs but keeps settings", () => {
    const s = fakeStorage({
      ...Object.fromEntries(RESET_KEYS.map((k) => [k, "x"])),
      "todomate.handoff.note-1.md": "x",
      ...Object.fromEntries(KEPT_KEYS_EXAMPLE.map((k) => [k, "keep"])),
      "unrelated.key": "keep",
    });
    clearPlannerLocalData(s);
    for (const k of RESET_KEYS) expect(s.has(k), k).toBe(false);
    expect(s.has("todomate.handoff.note-1.md")).toBe(false);
    for (const k of KEPT_KEYS_EXAMPLE) expect(s.has(k), k).toBe(true);
    expect(s.has("unrelated.key")).toBe(true);
  });
});
