import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, type TestContext } from "./helpers";

const ctx: TestContext = newContext();
const TOKEN = "sync-token";
const TOTAL = 503;

interface SyncResponse {
  changes: Array<{ table: string; row: { id: string; name?: string } }>;
  cursor: number;
  more: boolean;
}

beforeAll(async () => {
  await seedDevice(ctx, TOKEN);
  for (let i = 0; i < TOTAL; i += 1) {
    const id = `page-cat-${String(i).padStart(3, "0")}`;
    ctx.store.insertRow("category", {
      id,
      name: `Category ${i}`,
      color: "#ffffff",
      icon: null,
      order: 0,
      linkedSubjectId: null,
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
      deletedAt: null,
    });
    ctx.store.appendChange("category", id, "2026-11-20T00:00:00.000Z");
  }
});

describe("GET /sync", () => {
  it("pages at 500 rows and resumes at the cursor", async () => {
    const firstResponse = await call(ctx, "/sync?since=0", { token: TOKEN });
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as SyncResponse;
    expect(first.changes).toHaveLength(500);
    expect(first.more).toBe(true);
    expect(first.changes[0].table).toBe("category");
    expect(first.changes[0].row.name).toBe("Category 0");
    expect(first.cursor).toBeGreaterThanOrEqual(500);

    const secondResponse = await call(ctx, `/sync?since=${first.cursor}`, { token: TOKEN });
    const second = (await secondResponse.json()) as SyncResponse;
    expect(second.changes).toHaveLength(TOTAL - 500);
    expect(second.more).toBe(false);
    expect(second.changes[0].row.id).toBe("page-cat-500");
    expect(second.cursor).toBeGreaterThan(first.cursor);

    const emptyResponse = await call(ctx, `/sync?since=${second.cursor}`, { token: TOKEN });
    const empty = (await emptyResponse.json()) as SyncResponse;
    expect(empty.changes).toEqual([]);
    expect(empty.more).toBe(false);
    expect(empty.cursor).toBe(second.cursor);
  });
});
