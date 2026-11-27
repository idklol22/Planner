import { describe, expect, it } from "vitest";
import { defaultData } from "../domain/model";
import type { HealthRow, HubOp } from "../storage/hub";
import { getLocalRow, applyRemoteRow } from "./mapping";
import { LocalOutbox, OUTBOX_KEY } from "./queue";

const NOW = "2026-11-27T12:00:00.000Z";
const DAY = "2026-11-27";
const row: HealthRow = {
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
  updatedAt: NOW,
  deletedAt: null,
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("health rows in sync", () => {
  it("keeps health ops in the outbox for retry", () => {
    const storage = memoryStorage();
    const outbox = new LocalOutbox(storage);
    const op: HubOp = { table: "health", row };
    outbox.enqueue(op);
    expect(outbox.pending()).toEqual([op]);
    expect(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]")).toEqual([op]);
    outbox.ack([op]);
    expect(outbox.size()).toBe(0);
  });

  it("pulled health rows do not change AppData", () => {
    const data = defaultData();
    expect(getLocalRow(data, "health", row.id)).toBeNull();
    expect(applyRemoteRow(data, "health", row)).toBe(data);
  });
});
