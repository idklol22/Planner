import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { call, newContext, seedDevice } from "./helpers";

// pg-store.ts is Deno-only: the virtual module keeps its column map under test
// without adding a package (same pattern as pg-store.test.ts).
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }), { virtual: true });
import { PgStore } from "../pg-store";

const DATE = "2026-11-28";
const T = "2026-11-28T10:00:00.000Z";
const AT = "2026-11-28T11:00:00.000Z";
const REMOVE_AT = "2026-11-28T13:00:00.000Z";

function meal(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date: DATE,
    slot: "lunch",
    label: "Meal",
    kcal: 420,
    protein: 35,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...overrides,
  };
}

describe("meal protein over /ops and /sync", () => {
  it("survives a push and a pull (number and explicit null)", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "protein-user");
    const response = await call(ctx, "/ops", {
      method: "POST",
      token: "protein-user",
      body: {
        ops: [
          { table: "meal", row: meal("m-protein") },
          { table: "meal", row: meal("m-null", { protein: null }) },
        ],
      },
    });
    expect(response.status).toBe(200);

    expect(ctx.store.getRow("meal", "m-protein")).toMatchObject({ protein: 35 });
    expect(ctx.store.getRow("meal", "m-null")).toMatchObject({ protein: null });

    const pulled = await call(ctx, "/sync?since=0", { token: "protein-user" });
    const body = (await pulled.json()) as {
      changes: Array<{ table: string; row: Record<string, unknown> }>;
    };
    const rows = Object.fromEntries(
      body.changes.filter((c) => c.table === "meal").map((c) => [c.row.id, c.row]),
    );
    expect(rows["m-protein"]?.protein).toBe(35);
    expect(rows["m-null"]).toHaveProperty("protein", null);
  });
});

describe("widget calorie actions with protein", () => {
  it("creates calorie-only widget entries with a null protein", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "widget-cal");
    const id = "wcal_protein1";
    const added = await call(ctx, "/widget/action", {
      method: "POST",
      token: "widget-cal",
      body: { type: "calories.add", id, kcal: 250, date: DATE, at: AT },
    });
    expect(added.status).toBe(200);
    expect(ctx.store.getRow("meal", id)).toMatchObject({ kcal: 250, protein: null });
  });

  it("undoing a widget entry keeps protein already stored on that meal", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "widget-undo");
    const id = "wcal_protein2";
    await call(ctx, "/ops", {
      method: "POST",
      token: "widget-undo",
      body: { ops: [{ table: "meal", row: meal(id, { updatedAt: "2026-11-28T12:00:00.000Z" }) }] },
    });
    const removed = await call(ctx, "/widget/action", {
      method: "POST",
      token: "widget-undo",
      body: { type: "calories.remove", id, at: REMOVE_AT },
    });
    expect(removed.status).toBe(200);
    expect(ctx.store.getRow("meal", id)).toMatchObject({ protein: 35, deletedAt: REMOVE_AT });
  });
});

type Row = Record<string, unknown>;

/** Minimal supabase-js builder: chains are no-ops, writes are captured, reads
 *  return the supplied rows. Enough to exercise PgStore's column mapping. */
function fakeClient(reads: Record<string, Row[]>, writes: Row[]) {
  const builder = (table: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gt", "order", "limit", "in", "range"]) {
      b[method] = () => b;
    }
    b.maybeSingle = async () => ({ data: reads[table]?.[0] ?? null, error: null });
    b.upsert = async (row: Row) => {
      writes.push(row);
      return { error: null };
    };
    b.insert = async () => ({ error: null });
    b.then = (
      fulfilled: (value: { data: Row[]; error: null }) => unknown,
      rejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: reads[table] ?? [], error: null }).then(fulfilled, rejected);
    return b;
  };
  return { from: (table: string) => builder(table) };
}

describe("PgStore meal column map", () => {
  it("writes protein to the protein column and reads it back", async () => {
    const writes: Row[] = [];
    const reads: Record<string, Row[]> = {
      meal: [],
      change_log: [{ seq: 3 }],
    };
    const store = new PgStore(fakeClient(reads, writes) as never);

    const pushed = await store.upsertRows([{ table: "meal", row: meal("m-pg") as never }]);
    expect(pushed.applied).toBe(1);
    expect(writes[0]).toMatchObject({ id: "m-pg", kcal: 420, protein: 35 });

    reads.meal = [
      {
        id: "m-pg",
        date: DATE,
        slot: "",
        label: "",
        kcal: 0,
        protein: 35.5,
        updated_at: T,
        created_at: T,
        deleted_at: null,
      },
    ];
    const pulled = await store.listWidgetMeals(DATE);
    expect(pulled[0]).toMatchObject({ id: "m-pg", kcal: 0, protein: 35.5 });
  });
});

describe("migration", () => {
  it("adds a nullable numeric protein column to meal", () => {
    const sql = readFileSync(
      new URL("../../../migrations/20261128000001_meal_protein.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/ALTER TABLE meal ADD COLUMN IF NOT EXISTS protein/i);
    expect(sql).not.toMatch(/protein[^;\n]*NOT NULL/i);
  });
});
