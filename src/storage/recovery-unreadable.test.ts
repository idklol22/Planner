import { describe, expect, it } from "vitest";
import { BACKUP_KEY, QUARANTINE_PREFIX, recoverStored } from "./recovery";

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}
const earlier = JSON.stringify({ version: 1, raw: "{\"earlier\":true}", quality: "partial", at: "2026-11-01T00:00:00.000Z" });

describe("an unusable store when a better backup already exists", () => {
  for (const [name, raw] of [
    ["truncated JSON", '{"version":4,"tasks":[{"id":"t1","title":"keep me"'],
    ["unrecognised shape", '{"version":99,"tasks":[{"id":"t1","title":"keep me"}]}'],
  ]) {
    it(`keeps its own copy of ${name} and leaves the older backup alone`, () => {
      const storage = memory({ [BACKUP_KEY]: earlier });
      const result = recoverStored(raw, storage);
      const copies = [...storage.map].filter(([k]) => k.startsWith(QUARANTINE_PREFIX));
      expect(copies.map(([, v]) => v)).toEqual([raw]);
      expect(result.issue?.quarantinedKeys).toEqual(copies.map(([k]) => k));
      expect(storage.map.get(BACKUP_KEY)).toBe(earlier);
    });
  }
});
