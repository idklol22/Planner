/** Partial health pushes must merge onto the stored day, not erase it. */
import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, type TestContext } from "./helpers";
import { mergeHealthPush, validateHealthRow } from "../lib/widget";

const DAY = "2026-11-27";
const ID = `health_${DAY}`;
const T0 = "2026-11-27T09:00:00.000Z";
const T1 = "2026-11-27T10:00:00.000Z";
const T2 = "2026-11-27T11:00:00.000Z";
const T3 = "2026-11-27T12:00:00.000Z";
const WORKOUTS = [{ type: "run", minutes: 45, kcal: 410 }];

function fullRow(updatedAt = T1) {
  return {
    id: ID,
    date: DAY,
    activeKcal: 410,
    steps: 8000,
    exerciseMin: 45,
    distanceKm: 5.2,
    sleepHours: 7.5,
    restingHr: 58,
    workouts: WORKOUTS,
    source: "healthkit",
    updatedAt,
    deletedAt: null,
  };
}

function partial(patch: Record<string, unknown>, updatedAt = T2) {
  return { id: ID, date: DAY, updatedAt, ...patch };
}

async function push(ctx: TestContext, row: Record<string, unknown>) {
  const response = await call(ctx, "/ops", {
    method: "POST",
    token: USER,
    body: { ops: [{ table: "health", row }] },
  });
  expect(response.status).toBe(200);
  return response.json();
}

const USER = "health-merge-user";

describe("partial health push on the hub (memory store)", () => {
  const ctx = newContext();

  beforeAll(async () => {
    await seedDevice(ctx, USER);
  });

  it("keeps every stored field the request did not send", async () => {
    await push(ctx, fullRow());
    await push(ctx, partial({ steps: 0 })); // 0 is a real value, not "missing"

    expect(ctx.store.getRow("health", ID)).toMatchObject({
      activeKcal: 410,
      steps: 0,
      exerciseMin: 45,
      distanceKm: 5.2,
      sleepHours: 7.5,
      restingHr: 58,
      workouts: WORKOUTS,
      source: "healthkit",
      updatedAt: T2,
    });
  });

  it("applies explicit nulls and empty workout lists as clears", async () => {
    await push(ctx, partial({ activeKcal: null, workouts: [] }, T3));

    expect(ctx.store.getRow("health", ID)).toMatchObject({
      activeKcal: null,
      steps: 0,
      workouts: [],
      source: "healthkit",
      updatedAt: T3,
    });

    await push(ctx, partial({ workouts: null, steps: 9000 }, "2026-11-27T13:00:00.000Z"));
    expect(ctx.store.getRow("health", ID)).toMatchObject({ workouts: [], steps: 9000 });
  });

  it("keeps source and deletedAt unless they are sent, and lists them in /sync", async () => {
    await push(ctx, partial({ deletedAt: T3 }, "2026-11-27T14:00:00.000Z"));
    const withTombstone = ctx.store.getRow("health", ID);
    expect(withTombstone).toMatchObject({ deletedAt: T3, source: "healthkit", activeKcal: null });

    const sync = await call(ctx, `/sync?since=0`, { token: USER });
    const body = (await sync.json()) as {
      changes: Array<{ table: string; row: Record<string, unknown> }>;
    };
    const change = body.changes.filter((item) => item.table === "health").at(-1);
    expect(change?.row).toMatchObject({ id: ID, deletedAt: T3, source: "healthkit" });

    await push(ctx, partial({ source: null, deletedAt: null }, "2026-11-27T15:00:00.000Z"));
    expect(ctx.store.getRow("health", ID)).toMatchObject({ source: null, deletedAt: null, steps: 9000 });
  });

  it("ignores older pushes and stays unchanged when a push is replayed", async () => {
    const before = ctx.store.getRow("health", ID);
    await push(ctx, partial({ steps: 1, activeKcal: 999 }, T0));
    expect(ctx.store.getRow("health", ID)).toEqual(before);

    const newer = partial({ restingHr: 61 }, "2026-11-27T16:00:00.000Z");
    await push(ctx, newer);
    const applied = ctx.store.getRow("health", ID);
    await push(ctx, newer);
    expect(ctx.store.getRow("health", ID)).toEqual(applied);
    expect(applied).toMatchObject({ restingHr: 61, steps: 9000, source: null });
  });
});

describe("health push validation", () => {
  it("distinguishes absent fields from explicit values", () => {
    const partialResult = validateHealthRow(partial({ steps: 0 }));
    expect(partialResult).toMatchObject({ ok: true });
    if (!partialResult.ok) return;
    expect(partialResult.row).toHaveProperty("steps", 0);
    expect(partialResult.row).not.toHaveProperty("activeKcal");
    expect(partialResult.row).not.toHaveProperty("workouts");
    expect(partialResult.row).not.toHaveProperty("source");
    expect(partialResult.row).not.toHaveProperty("deletedAt");

    const cleared = validateHealthRow(partial({ activeKcal: null, workouts: null }));
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.row).toHaveProperty("activeKcal", null);
    expect(cleared.row).toHaveProperty("workouts", []);
  });

  it("seeds a brand-new day with nulls for fields the push omitted", () => {
    const validated = validateHealthRow(partial({ steps: 100 }, T1));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(mergeHealthPush(null, validated.row)).toEqual({
      id: ID,
      date: DAY,
      activeKcal: null,
      steps: 100,
      exerciseMin: null,
      distanceKm: null,
      sleepHours: null,
      restingHr: null,
      workouts: [],
      source: null,
      updatedAt: T1,
      deletedAt: null,
    });
  });

  it("accepts workouts stored as a JSON string (legacy Postgres cells)", () => {
    const validated = validateHealthRow(partial({ steps: 1 }));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const stored = { ...fullRow(), workouts: JSON.stringify(WORKOUTS) } as unknown as Parameters<
      typeof mergeHealthPush
    >[0];
    expect(mergeHealthPush(stored, validated.row).workouts).toEqual(WORKOUTS);
  });
});
