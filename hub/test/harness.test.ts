import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { call, seedDevice } from "./helpers";

const USER = "harness-user-token";
const HARNESS = "harness-device-token";
const UPDATED = "2026-11-20T10:00:00.000Z";

function mirrorOps(prefix: string) {
  return [
    {
      table: "h_subject",
      row: { id: `${prefix}-subject`, name: "Math", color: "#123456", order: 1, updatedAt: UPDATED, deletedAt: null },
    },
    {
      table: "h_topic",
      row: { id: `${prefix}-topic`, subjectId: `${prefix}-subject`, name: "Algebra", order: 2, updatedAt: UPDATED, deletedAt: null },
    },
    {
      table: "h_material",
      row: {
        id: `${prefix}-material`,
        subjectId: `${prefix}-subject`,
        topicId: `${prefix}-topic`,
        fileName: "notes.pdf",
        title: "Algebra notes",
        kind: "pdf",
        sha256: "abc123",
        pageCount: 12,
        lecture: "L1",
        date: "2026-11-20",
        addedAt: UPDATED,
        updatedAt: UPDATED,
        deletedAt: null,
      },
    },
    {
      table: "h_deadline",
      row: {
        id: `${prefix}-deadline`,
        subjectId: `${prefix}-subject`,
        topicId: `${prefix}-topic`,
        title: "Problem set",
        due: "2026-11-30",
        kind: "homework",
        done: true,
        updatedAt: UPDATED,
        deletedAt: null,
      },
    },
  ];
}

beforeAll(async () => {
  await seedDevice(USER);
  await seedDevice(HARNESS, { name: "laptop", role: "harness" });
});

describe("h_* write permissions", () => {
  it("refuses h_* writes from ordinary devices", async () => {
    const response = await call("/ops", {
      method: "POST",
      token: USER,
      body: { ops: mirrorOps("denied") },
    });
    expect(response.status).toBe(403);
    // Nothing from the batch was applied.
    expect(
      await env.DB.prepare("SELECT id FROM h_subject WHERE id = ?").bind("denied-subject").first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM h_material WHERE id = ?").bind("denied-material").first(),
    ).toBeNull();
  });

  it("also refuses a mixed batch that contains an h_* write", async () => {
    const response = await call("/ops", {
      method: "POST",
      token: USER,
      body: {
        ops: [
          { table: "category", row: { id: "denied-category", name: "x", updatedAt: UPDATED } },
          { table: "h_topic", row: mirrorOps("denied")[1].row },
        ],
      },
    });
    expect(response.status).toBe(403);
    expect(
      await env.DB.prepare("SELECT id FROM category WHERE id = ?").bind("denied-category").first(),
    ).toBeNull();
  });

  it("allows h_* writes from a harness device", async () => {
    const response = await call("/ops", {
      method: "POST",
      token: HARNESS,
      body: { ops: mirrorOps("allowed") },
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { applied: number }).toMatchObject({ applied: 4 });

    const material = await env.DB.prepare("SELECT * FROM h_material WHERE id = ?")
      .bind("allowed-material")
      .first<{ file_name: string; page_count: number; sha256: string }>();
    expect(material).toMatchObject({
      file_name: "notes.pdf",
      page_count: 12,
      sha256: "abc123",
    });
    const deadline = await env.DB.prepare("SELECT done FROM h_deadline WHERE id = ?")
      .bind("allowed-deadline")
      .first<{ done: number }>();
    expect(deadline?.done).toBe(1);

    // Ordinary tables still work for every device.
    const ordinary = await call("/ops", {
      method: "POST",
      token: USER,
      body: {
        ops: [
          {
            table: "category",
            row: {
              id: "ok-category",
              name: "x",
              color: "#fff",
              icon: null,
              order: 0,
              linkedSubjectId: null,
              archived: false,
              createdAt: UPDATED,
              updatedAt: UPDATED,
              deletedAt: null,
            },
          },
        ],
      },
    });
    expect(ordinary.status).toBe(200);
  });
});

describe("GET /sync with h_* rows", () => {
  it("streams harness mirror rows to ordinary devices", async () => {
    const ops = mirrorOps("synced");
    const put = await call("/ops", { method: "POST", token: HARNESS, body: { ops } });
    expect(put.status).toBe(200);

    const response = await call("/sync?since=0", { token: USER });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      changes: Array<{ table: string; row: Record<string, unknown> }>;
      cursor: number;
      more: boolean;
    };
    const byId = new Map(body.changes.map((change) => [String(change.row.id), change]));
    for (const id of ["synced-subject", "synced-topic", "synced-material", "synced-deadline"]) {
      expect(byId.has(id)).toBe(true);
    }
    expect(byId.get("synced-subject")?.table).toBe("h_subject");
    expect(byId.get("synced-topic")?.row).toMatchObject({ subjectId: "synced-subject", order: 2 });
    expect(byId.get("synced-material")?.row).toMatchObject({
      fileName: "notes.pdf",
      topicId: "synced-topic",
      kind: "pdf",
      sha256: "abc123",
      pageCount: 12,
    });
    expect(byId.get("synced-deadline")?.row).toMatchObject({ done: true, due: "2026-11-30" });
  });
});
