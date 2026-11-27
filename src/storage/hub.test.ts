import { afterEach, describe, expect, it, vi } from "vitest";
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
