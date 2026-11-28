import { describe, expect, it, vi } from "vitest";

// pg-store.ts is Deno-only and @supabase/supabase-js is not installed in this
// workspace. A virtual module keeps the Postgres store's completion path under
// test without adding a package or deploying anything.
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }), { virtual: true });

import { PgStore } from "../pg-store";

const IMAGE = "data:image/png;base64,QUJD";

function fakeClient(type: string) {
  const row: Record<string, unknown> = {
    id: "cmd-1",
    type,
    payload_json: { markdown: `![photo](${IMAGE})`, title: "Note" },
    status: "claimed",
    claimed_by: "agent-1",
    lease_until: null,
    result_json: null,
    created_at: "2026-11-27T00:00:00.000Z",
    updated_at: "2026-11-27T00:00:00.000Z",
  };
  let patch: Record<string, unknown> | null = null;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: { ...row, ...(patch ?? {}) }, error: null })),
    update: vi.fn((value: Record<string, unknown>) => {
      patch = value;
      return builder;
    }),
  };
  const client = { from: vi.fn(() => builder) };
  return { client, patch: () => patch, builder };
}

function storeFor(client: unknown): PgStore {
  return new PgStore(client as never);
}

function fakeHealthClient(existing: Record<string, unknown>) {
  const upserts: Array<Record<string, unknown>> = [];
  const healthBuilder = {
    select: vi.fn(() => healthBuilder),
    eq: vi.fn(() => healthBuilder),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    upsert: vi.fn((row: Record<string, unknown>) => {
      upserts.push(row);
      return healthBuilder;
    }),
  };
  const logBuilder = {
    select: vi.fn(() => logBuilder),
    insert: vi.fn(() => logBuilder),
    order: vi.fn(() => logBuilder),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  const client = {
    from: vi.fn((table: string) => (table === "health" ? healthBuilder : logBuilder)),
  };
  return { client, upserts };
}

const HEALTH_DAY = "2026-11-27";
const HEALTH_ID = `health_${HEALTH_DAY}`;

describe("PgStore.upsertRows health merge", () => {
  const stored = {
    id: HEALTH_ID,
    date: HEALTH_DAY,
    active_kcal: 410,
    steps: 8000,
    exercise_min: 45,
    distance_km: 5.2,
    sleep_hours: 7.5,
    resting_hr: 58,
    workouts_json: [{ type: "run", minutes: 45, kcal: 410 }],
    source: "healthkit",
    updated_at: "2026-11-27T10:00:00.000Z",
    deleted_at: null,
  };

  it("writes stored fields that a partial push omitted", async () => {
    const { client, upserts } = fakeHealthClient(stored);
    await storeFor(client).upsertRows([{
      table: "health",
      row: {
        id: HEALTH_ID,
        date: HEALTH_DAY,
        steps: 0,
        updatedAt: "2026-11-27T11:00:00.000Z",
      } as never,
    }]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      id: HEALTH_ID,
      steps: 0,
      active_kcal: 410,
      exercise_min: 45,
      workouts_json: stored.workouts_json,
      updated_at: "2026-11-27T11:00:00.000Z",
    });
  });

  it("skips a stale partial push without writing", async () => {
    const { client, upserts } = fakeHealthClient(stored);
    await storeFor(client).upsertRows([{
      table: "health",
      row: {
        id: HEALTH_ID,
        date: HEALTH_DAY,
        steps: 1,
        updatedAt: "2026-11-27T09:00:00.000Z",
      } as never,
    }]);
    expect(upserts).toHaveLength(0);
  });
});

describe("PgStore.completeCommand", () => {
  it("strips stored note photos on successful completion", async () => {
    const { client, patch } = fakeClient("harness.note");
    const result = await storeFor(client).completeCommand("cmd-1", "done", { ok: true });

    expect(patch()).toMatchObject({
      status: "done",
      payload_json: { markdown: "![photo](photo-removed)", title: "Note" },
    });
    expect(result?.status).toBe("done");
    expect(result?.payload).toEqual({ markdown: "![photo](photo-removed)", title: "Note" });
  });

  it("keeps stored note photos on failure", async () => {
    const { client, patch } = fakeClient("harness.note");
    await storeFor(client).completeCommand("cmd-1", "failed", { error: "busy" });

    expect(patch()).toMatchObject({ status: "failed" });
    expect(patch()).not.toHaveProperty("payload_json");
  });

  it("does not touch the payload of other command types", async () => {
    const { client, patch } = fakeClient("other.task");
    await storeFor(client).completeCommand("cmd-1", "done", { ok: true });

    expect(patch()).toMatchObject({ status: "done" });
    expect(patch()).not.toHaveProperty("payload_json");
  });
});
