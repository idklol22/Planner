import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultData, makeTask } from "../domain/model";
import { applyRemoteRow, taskToRow } from "../sync/mapping";
import { HubClient, HubError, type WidgetProfile } from "./hub";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Notes and mirrored PDFs still depend on the file endpoints, even though the
 *  Planner no longer syncs messages. Keep both methods on the client. */
describe("hub file methods survive the message removal", () => {
  it("still exposes putFile and getFile", () => {
    const client = new HubClient("https://hub.example", "t");
    expect(typeof client.putFile).toBe("function");
    expect(typeof client.getFile).toBe("function");
  });
});

/** Guards the other half of the boundary: task sync (including archivedAt)
 *  must keep mapping exactly as before the message feature was removed. */
describe("task sync is unchanged", () => {
  const archivedAt = "2026-11-21T12:00:00.000Z";

  it("maps a task with archivedAt through taskToRow and applyRemoteRow", () => {
    const task = { ...makeTask("2026-11-21", "Archived task", 0), archivedAt, updatedAt: archivedAt };
    const row = taskToRow(task);
    expect(row.archivedAt).toBe(archivedAt);
    const data = applyRemoteRow(defaultData(), "task", row);
    expect(data.tasks[0].archivedAt).toBe(archivedAt);
    expect(data.tasks[0].title).toBe("Archived task");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("widget hub methods", () => {
  it("creates a widget token with POST /widget/token", async () => {
    const fetch = mockFetch(201, { token: "abcdef" });
    const client = new HubClient("https://hub.example/", "device-token");
    expect(await client.createWidgetToken()).toBe("abcdef");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hub.example/widget/token");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer device-token");
  });

  it("rejects a token response that is missing the token", async () => {
    mockFetch(201, {});
    await expect(new HubClient("https://hub.example", "t").createWidgetToken()).rejects.toThrow(HubError);
  });

  it("uploads the profile with PUT /widget/profile", async () => {
    const fetch = mockFetch(200, { ok: true });
    const profile: WidgetProfile = {
      calorieGoal: 2000,
      theme: {
        bg: "#000",
        surface: "#111",
        text: "#fff",
        muted: "#aaa",
        faint: "#777",
        accent: "#0f0",
        accentContrast: "#000",
        dark: true,
      },
      goals: [],
    };
    await new HubClient("https://hub.example", "t").putWidgetProfile(profile);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hub.example/widget/profile");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(profile);
  });
});
