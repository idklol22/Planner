import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, sha256Hex, type TestContext } from "./helpers";
import { validateHealthRow, validateWidgetAction } from "../lib/widget";

const DATE = "2026-11-27";
const UPDATED = "2026-11-27T10:00:00.000Z";

interface WidgetView {
  date: string;
  generatedAt: string;
  theme: Record<string, unknown> | null;
  calories: {
    eaten: number;
    goal: number | null;
    lastWidgetEntry: { id: string; kcal: number; at: string } | null;
    burned: number | null;
    steps: number | null;
  };
  categories: Array<{
    id: string;
    name: string;
    color: string;
    order: number;
    goals: Array<{ title: string; done: boolean }>;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    date: string;
    done: boolean;
    categoryId: string | null;
    seriesId: string | null;
    time: string | null;
    deadline: boolean;
    order: number;
    subtasksDone: number;
    subtasksTotal: number;
  }>;
}

function healthRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `health_${DATE}`,
    date: DATE,
    activeKcal: 410,
    steps: 8000,
    exerciseMin: 45,
    distanceKm: 5.2,
    sleepHours: 7.5,
    restingHr: 58,
    workouts: [{ type: "run", minutes: 45, kcal: 410 }],
    source: "healthkit",
    updatedAt: UPDATED,
    deletedAt: null,
    ...overrides,
  };
}

function category(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Category ${id}`,
    color: "#ffffff",
    icon: null,
    order: 0,
    linkedSubjectId: null,
    archived: false,
    createdAt: UPDATED,
    updatedAt: UPDATED,
    deletedAt: null,
    ...overrides,
  };
}

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    date: DATE,
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
    note: null,
    createdAt: UPDATED,
    updatedAt: UPDATED,
    deletedAt: null,
    ...overrides,
  };
}

function meal(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date: DATE,
    slot: "lunch",
    label: "Meal",
    kcal: 400,
    createdAt: UPDATED,
    updatedAt: UPDATED,
    deletedAt: null,
    ...overrides,
  };
}

async function ops(ctx: TestContext, token: string, rows: Array<{ table: string; row: Record<string, unknown> }>) {
  return call(ctx, "/ops", { method: "POST", token, body: { ops: rows } });
}

const THEME = {
  bg: "#000000",
  surface: "#111111",
  text: "#ffffff",
  muted: "#aaaaaa",
  faint: "#666666",
  accent: "#00ff00",
  accentContrast: "#000000",
  dark: true,
};

function profile(overrides: Record<string, unknown> = {}) {
  return {
    calorieGoal: 2000,
    theme: THEME,
    goals: [
      { id: "g1", categoryId: "cat-a", title: "Run 5k", done: false, order: 2 },
      { id: "g2", categoryId: "cat-a", title: "Stretch", done: true, order: 1 },
      { id: "g3", categoryId: "cat-b", title: "Read", done: false, order: 0 },
    ],
    ...overrides,
  };
}

describe("widget device roles", () => {
  const ctx = newContext();
  const USER = "widget-user";
  const WIDGET = "widget-device";

  beforeAll(async () => {
    await seedDevice(ctx, USER);
    await seedDevice(ctx, WIDGET, { role: "widget", name: "Home Screen" });
  });

  it("lets a widget token read the widget and submit actions only", async () => {
    expect((await call(ctx, `/widget?date=${DATE}`, { token: WIDGET })).status).toBe(200);
    expect(
      (
        await call(ctx, "/widget/action", {
          method: "POST",
          token: WIDGET,
          body: { type: "calories.remove", id: "wcal_abcdefgh", at: UPDATED },
        })
      ).status,
    ).toBe(404); // authorized, but the meal is missing
  });

  it("gives 403 on every other authenticated route", async () => {
    const cases: Array<[string, Parameters<typeof call>[1], Parameters<typeof call>[2]?]> = [
      ["/ops", { method: "POST", body: { ops: [] } }],
      ["/sync", {}],
      [`/files/${"a".repeat(64)}`, {}],
      ["/commands", { method: "POST", body: { type: "ping" } }],
      ["/events", { method: "POST", body: { type: "ping" } }],
      ["/widget/token", { method: "POST" }],
      ["/widget/profile", { method: "PUT", body: profile() }],
    ];
    for (const [path, options] of cases) {
      const response = await call(ctx, path, { ...options, token: WIDGET });
      expect(response.status, path).toBe(403);
    }
  });

  it("refuses widget routes for a harness device", async () => {
    const local = newContext();
    await seedDevice(local, "harness", { role: "harness" });
    expect((await call(local, `/widget?date=${DATE}`, { token: "harness" })).status).toBe(403);
    expect(
      (
        await call(local, "/widget/token", { method: "POST", token: "harness" })
      ).status,
    ).toBe(403);
  });
});

describe("POST /widget/token", () => {
  it("returns a 64-hex token, stores only its hash, and revokes earlier widget devices", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "owner");

    const firstResponse = await call(ctx, "/widget/token", { method: "POST", token: "owner" });
    expect(firstResponse.status).toBe(201);
    const firstToken = ((await firstResponse.json()) as { token: string }).token;
    expect(firstToken).toMatch(/^[0-9a-f]{64}$/);
    const firstHash = await sha256Hex(firstToken);
    const devices = ctx.store.listDevices();
    const registered = devices.find((device) => device.tokenHash === firstHash);
    expect(registered?.role).toBe("widget");
    expect(registered?.id).not.toContain(firstToken);

    expect((await call(ctx, `/widget?date=${DATE}`, { token: firstToken })).status).toBe(200);
    expect((await call(ctx, "/sync", { token: firstToken })).status).toBe(403);

    const secondResponse = await call(ctx, "/widget/token", { method: "POST", token: "owner" });
    const secondToken = ((await secondResponse.json()) as { token: string }).token;
    expect(secondToken).not.toBe(firstToken);
    expect((await call(ctx, "/sync", { token: firstToken })).status).toBe(401);
    expect((await call(ctx, `/widget?date=${DATE}`, { token: firstToken })).status).toBe(401);
    expect((await call(ctx, `/widget?date=${DATE}`, { token: secondToken })).status).toBe(200);
  });
});

describe("PUT /widget/profile", () => {
  const ctx = newContext();
  const USER = "profile-user";
  const WIDGET = "profile-widget";

  beforeAll(async () => {
    await seedDevice(ctx, USER);
    await seedDevice(ctx, WIDGET, { role: "widget" });
    await ops(ctx, USER, [{ table: "category", row: category("cat-a") }]);
  });

  it("stores the profile and exposes it in the widget view", async () => {
    const saved = await call(ctx, "/widget/profile", { method: "PUT", token: USER, body: profile() });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true });

    const viewResponse = await call(ctx, `/widget?date=${DATE}`, { token: WIDGET });
    const view = (await viewResponse.json()) as WidgetView;
    expect(view.theme).toEqual(THEME);
    expect(view.calories.goal).toBe(2000);
    expect(view.categories).toHaveLength(1);
    expect(view.categories[0].goals).toEqual([
      { title: "Stretch", done: true },
      { title: "Run 5k", done: false },
    ]);
  });

  it("rejects invalid and oversized profiles", async () => {
    expect(
      (
        await call(ctx, "/widget/profile", {
          method: "PUT",
          token: USER,
          body: profile({ calorieGoal: -1 }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, "/widget/profile", {
          method: "PUT",
          token: USER,
          body: profile({ theme: { ...THEME, dark: "yes" } }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, "/widget/profile", {
          method: "PUT",
          token: USER,
          body: profile({ goals: Array.from({ length: 501 }, () => profile().goals[0]) }),
        })
      ).status,
    ).toBe(400);
    const big = await call(ctx, "/widget/profile", {
      method: "PUT",
      token: USER,
      rawBody: "x".repeat(100 * 1024 + 1),
    });
    expect(big.status).toBe(400);
  });
});

describe("GET /widget", () => {
  const ctx = newContext();
  const USER = "view-user";
  const WIDGET = "view-widget";

  beforeAll(async () => {
    await seedDevice(ctx, USER);
    await seedDevice(ctx, WIDGET, { role: "widget" });
    expect(
      (
        await ops(ctx, USER, [
          {
            table: "category",
            row: category("cat-a", { order: 2 }),
          },
          { table: "category", row: category("cat-b", { order: 1 }) },
          { table: "category", row: category("cat-hidden", { archived: true }) },
          { table: "category", row: category("cat-deleted", { deletedAt: UPDATED }) },
          { table: "meal", row: meal("meal-1", { kcal: 400 }) },
          { table: "meal", row: meal("wcal_12345678", { kcal: 250, createdAt: "2026-11-27T11:00:00.000Z" }) },
          { table: "meal", row: meal("wcal_87654321", { kcal: 300, createdAt: "2026-11-27T12:00:00.000Z" }) },
          { table: "meal", row: meal("meal-deleted", { kcal: 999, deletedAt: UPDATED }) },
          { table: "meal", row: meal("meal-other", { kcal: 777, date: "2026-11-26" }) },
          { table: "health", row: healthRow() },
          { table: "task", row: task("t-parent", { title: "Parent", categoryId: "cat-a", order: 1, deadline: true, time: "09:00" }) },
          { table: "task", row: task("t-child-1", { title: "Sub 1", parentId: "t-parent", done: true }) },
          { table: "task", row: task("t-child-2", { title: "Sub 2", parentId: "t-parent", done: false }) },
          { table: "task", row: task("t-template", { rrule: "daily", seriesId: null, order: 0 }) },
          { table: "task", row: task("t-old-done", { date: "2026-11-26", done: true }) },
          { table: "task", row: task("t-future-done", { date: "2026-11-28", done: true }) },
          { table: "task", row: task("t-deleted", { deletedAt: UPDATED }) },
          { table: "task", row: task("t-archived", { archivedAt: UPDATED }) },
        ]),
      ).status,
    ).toBe(200);
  });

  it("requires a valid date", async () => {
    expect((await call(ctx, "/widget", { token: USER })).status).toBe(400);
    expect((await call(ctx, "/widget?date=2026-11-31", { token: USER })).status).toBe(400);
    expect((await call(ctx, "/widget?date=nope", { token: USER })).status).toBe(400);
  });

  it("builds categories, calories, health and task counts", async () => {
    const response = await call(ctx, `/widget?date=${DATE}`, { token: WIDGET });
    expect(response.status).toBe(200);
    const view = (await response.json()) as WidgetView;
    expect(view.date).toBe(DATE);
    expect(view.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(view.calories.eaten).toBe(950); // 400 + 250 + 300
    expect(view.calories.lastWidgetEntry).toEqual({
      id: "wcal_87654321",
      kcal: 300,
      at: "2026-11-27T12:00:00.000Z",
    });
    expect(view.calories.burned).toBe(410);
    expect(view.calories.steps).toBe(8000);
    expect(view.calories.goal).toBeNull();

    expect(view.categories.map((category) => category.id)).toEqual(["cat-b", "cat-a"]);

    const parent = view.tasks.find((entry) => entry.id === "t-parent");
    expect(parent).toMatchObject({
      title: "Parent",
      done: false,
      categoryId: "cat-a",
      seriesId: null,
      time: "09:00",
      deadline: true,
      subtasksDone: 1,
      subtasksTotal: 2,
    });
    expect(view.tasks.find((entry) => entry.id === "t-template")?.seriesId).toBe("t-template");
    expect(view.tasks.find((entry) => entry.id === "t-child-1")).toBeUndefined();
    expect(view.tasks.find((entry) => entry.id === "t-old-done")).toBeUndefined();
    expect(view.tasks.find((entry) => entry.id === "t-future-done")?.id).toBe("t-future-done");
    expect(view.tasks.find((entry) => entry.id === "t-deleted")).toBeUndefined();
    expect(view.tasks.find((entry) => entry.id === "t-archived")).toBeUndefined();
    const ids = view.tasks.map((entry) => entry.id);
    expect(ids).toEqual(["t-template", "t-parent", "t-future-done"]);
  });

  it("caps the view at 1000 considered task rows", async () => {
    const local = newContext();
    await seedDevice(local, "paging-user");
    for (let index = 0; index < 1100; index += 1) {
      local.store.insertRow("task", task(`page-${String(index).padStart(4, "0")}`));
    }
    const response = await call(local, `/widget?date=${DATE}`, { token: "paging-user" });
    const view = (await response.json()) as WidgetView;
    expect(view.tasks).toHaveLength(1000);
  });
});

describe("POST /widget/action", () => {
  it("sets a task done, is idempotent, and ignores genuinely stale actions", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "actor");
    await ops(ctx, "actor", [
      { table: "task", row: task("action-task", { updatedAt: "2026-11-27T09:00:00.000Z" }) },
    ]);

    const at = "2026-11-27T11:00:00.000Z";
    const first = await call(ctx, "/widget/action", {
      method: "POST",
      token: "actor",
      body: { type: "task.set_done", taskId: "action-task", done: true, at },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(ctx.store.getRow("task", "action-task")).toMatchObject({ done: true, completedAt: at, updatedAt: at });
    const changeCount = ctx.store.getChangeLog("task", "action-task").length;

    const repeat = await call(ctx, "/widget/action", {
      method: "POST",
      token: "actor",
      body: { type: "task.set_done", taskId: "action-task", done: true, at },
    });
    expect(await repeat.json()).toEqual({ ok: true });
    expect(ctx.store.getChangeLog("task", "action-task")).toHaveLength(changeCount);

    const stale = await call(ctx, "/widget/action", {
      method: "POST",
      token: "actor",
      body: { type: "task.set_done", taskId: "action-task", done: false, at: "2020-01-01T00:00:00.000Z" },
    });
    expect(await stale.json()).toEqual({ ok: true, ignored: true });
    expect(ctx.store.getRow("task", "action-task")).toMatchObject({ done: true, completedAt: at });

    const missing = await call(ctx, "/widget/action", {
      method: "POST",
      token: "actor",
      body: { type: "task.set_done", taskId: "no-such-task", done: true, at },
    });
    expect(missing.status).toBe(404);
  });

  it("adds and removes widget calories through /ops, idempotently", async () => {
    const ctx = newContext();
    await seedDevice(ctx, "cal-actor");
    const id = "wcal_ABCdef12";
    const addedAt = "2026-11-27T12:30:00.000Z";

    const add = await call(ctx, "/widget/action", {
      method: "POST",
      token: "cal-actor",
      body: { type: "calories.add", id, kcal: 250, date: DATE, at: addedAt },
    });
    expect(await add.json()).toEqual({ ok: true });
    expect(ctx.store.getRow("meal", id)).toMatchObject({
      kcal: 250,
      createdAt: addedAt,
      updatedAt: addedAt,
      deletedAt: null,
      slot: "",
      label: "",
    });

    const repeat = await call(ctx, "/widget/action", {
      method: "POST",
      token: "cal-actor",
      body: { type: "calories.add", id, kcal: 250, date: DATE, at: addedAt },
    });
    expect(await repeat.json()).toEqual({ ok: true });
    expect(ctx.store.getChangeLog("meal", id)).toHaveLength(1);

    const sync = await call(ctx, "/sync?since=0", { token: "cal-actor" });
    const body = (await sync.json()) as { changes: Array<{ table: string; row: { id: string } }> };
    expect(body.changes.some((change) => change.table === "meal" && change.row.id === id)).toBe(true);

    const removeAt = "2026-11-27T13:00:00.000Z";
    const remove = await call(ctx, "/widget/action", {
      method: "POST",
      token: "cal-actor",
      body: { type: "calories.remove", id, at: removeAt },
    });
    expect(await remove.json()).toEqual({ ok: true });
    const removed = ctx.store.getRow("meal", id);
    expect(removed?.deletedAt).toBe(removeAt);
    expect(Date.parse(String(removed?.updatedAt))).toBeGreaterThan(Date.parse(addedAt));

    const removeAgain = await call(ctx, "/widget/action", {
      method: "POST",
      token: "cal-actor",
      body: { type: "calories.remove", id, at: removeAt },
    });
    expect(await removeAgain.json()).toEqual({ ok: true });
    expect(ctx.store.getRow("meal", id)?.deletedAt).toBe(removeAt);

    const view = (await (await call(ctx, `/widget?date=${DATE}`, { token: "cal-actor" })).json()) as WidgetView;
    expect(view.calories.eaten).toBe(0);
    expect(view.calories.lastWidgetEntry).toBeNull();

    const missing = await call(ctx, "/widget/action", {
      method: "POST",
      token: "cal-actor",
      body: { type: "calories.remove", id: "wcal_missing1", at: removeAt },
    });
    expect(missing.status).toBe(404);
  });

  it("validates action shapes", async () => {
    const cases: unknown[] = [
      { type: "task.set_done", taskId: "x", done: "yes", at: UPDATED },
      { type: "task.set_done", taskId: "x", done: true, at: "yesterday" },
      { type: "calories.add", id: "bad", kcal: 250, date: DATE, at: UPDATED },
      { type: "calories.add", id: "wcal_abcdefgh", kcal: 0, date: DATE, at: UPDATED },
      { type: "calories.add", id: "wcal_abcdefgh", kcal: 250, date: "2026-13-01", at: UPDATED },
      { type: "calories.remove", id: "meal-1", at: UPDATED },
      { type: "unknown", at: UPDATED },
    ];
    for (const body of cases) {
      expect(validateWidgetAction(body)).toMatchObject({ ok: false });
    }
    expect(validateWidgetAction({ type: "calories.add", id: "wcal_abcdefgh", kcal: 1, date: DATE, at: UPDATED })).toMatchObject({ ok: true });
  });
});

describe("health row validation", () => {
  const ctx = newContext();
  const USER = "health-user";

  beforeAll(async () => {
    await seedDevice(ctx, USER);
  });

  it("accepts a valid health row over /ops and streams it through /sync", async () => {
    const row = healthRow();
    const response = await ops(ctx, USER, [{ table: "health", row }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 1 });
    expect(ctx.store.getRow("health", row.id)).toMatchObject({ steps: 8000, workouts: row.workouts });

    const sync = await call(ctx, "/sync?since=0", { token: USER });
    const body = (await sync.json()) as { changes: Array<{ table: string; row: Record<string, unknown> }> };
    const change = body.changes.find((item) => item.table === "health");
    expect(change?.row).toMatchObject({ id: row.id, source: "healthkit", activeKcal: 410 });
  });

  it("accepts snake_case workouts_json and null metrics", async () => {
    const row = {
      ...healthRow({ id: "health_2026-11-26", date: "2026-11-26" }),
      workouts_json: [],
      activeKcal: null,
    };
    delete (row as Record<string, unknown>).workouts;
    const response = await ops(ctx, USER, [{ table: "health", row }]);
    expect(response.status).toBe(200);
    expect(ctx.store.getRow("health", row.id)).toMatchObject({ workouts: [], activeKcal: null });
  });

  it("rejects malformed rows in the validator and over /ops", async () => {
    const cases: Array<{ name: string; row: Record<string, unknown> }> = [
      { name: "bad id", row: healthRow({ id: "health_wrong" }) },
      { name: "bad date", row: healthRow({ date: "2026-11-31" }) },
      { name: "negative kcal", row: healthRow({ activeKcal: -1 }) },
      { name: "kcal over limit", row: healthRow({ activeKcal: 50001 }) },
      { name: "fractional steps", row: healthRow({ steps: 1.5 }) },
      { name: "steps over limit", row: healthRow({ steps: 1000001 }) },
      { name: "exercise over 1440", row: healthRow({ exerciseMin: 1441 }) },
      { name: "distance over 1000", row: healthRow({ distanceKm: 1001 }) },
      { name: "sleep over 24", row: healthRow({ sleepHours: 25 }) },
      { name: "hr over 400", row: healthRow({ restingHr: 401 }) },
      { name: "bad source", row: healthRow({ source: "watch" }) },
      { name: "too many workouts", row: healthRow({ workouts: Array.from({ length: 51 }, () => ({ type: "run", minutes: 1, kcal: 1 })) }) },
      { name: "bad workout", row: healthRow({ workouts: [{ type: "run", minutes: -1, kcal: null }] }) },
    ];
    for (const [index, testCase] of cases.entries()) {
      expect(validateHealthRow(testCase.row), testCase.name).toMatchObject({ ok: false });
      const id = `health-bad-${index}`;
      const response = await ops(ctx, USER, [
        { table: "health", row: { ...testCase.row, id, date: DATE } },
      ]);
      expect(response.status, testCase.name).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/^health: /);
      expect(ctx.store.getRow("health", id)).toBeUndefined();
    }
  });
});
