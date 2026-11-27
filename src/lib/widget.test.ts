import { describe, expect, it } from "vitest";
import { defaultData, makeGoal } from "../domain/model";
import { THEMES } from "../theme/themes";
import { buildWidgetProfile, encodeWidgetCode } from "./widget";

const TOKENS = THEMES.wabi.tokens;

function decodeCode(code: string): { u: string; t: string } {
  const body = code.slice("PLW1.".length).replace(/-/g, "+").replace(/_/g, "/");
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as { u: string; t: string };
}

describe("buildWidgetProfile", () => {
  it("maps theme tokens and the calorie goal", () => {
    const data = { ...defaultData(), settings: { ...defaultData().settings, dailyCalorieGoal: 2350 } };
    expect(buildWidgetProfile(data, TOKENS, true)).toMatchObject({
      calorieGoal: 2350,
      theme: {
        bg: TOKENS.bg,
        surface: TOKENS.surface,
        text: TOKENS.text,
        muted: TOKENS.textMuted,
        faint: TOKENS.textFaint,
        accent: TOKENS.accent,
        accentContrast: TOKENS.accentContrast,
        dark: true,
      },
      goals: [],
    });
  });

  it("keeps live goals, derives done from achievedAt and sorts by order", () => {
    const early = { ...makeGoal("cat-1", "Early", 0), id: "early", achievedAt: "2026-11-27T08:00:00.000Z" };
    const late = { ...makeGoal("cat-2", "Late", 1), id: "late" };
    const deleted = { ...makeGoal("cat-3", "Deleted", 2), id: "deleted", deletedAt: "2026-11-27T09:00:00.000Z" };
    const data = { ...defaultData(), goals: [late, deleted, early] };
    expect(buildWidgetProfile(data, TOKENS, false).goals).toEqual([
      { id: "early", categoryId: "cat-1", title: "Early", done: true, order: 0 },
      { id: "late", categoryId: "cat-2", title: "Late", done: false, order: 1 },
    ]);
  });

  it("clamps the calorie goal into the hub range", () => {
    const base = defaultData();
    expect(buildWidgetProfile({ ...base, settings: { ...base.settings, dailyCalorieGoal: 999_999 } }, TOKENS, false).calorieGoal).toBe(100_000);
  });
});

describe("encodeWidgetCode", () => {
  it("encodes URL-safe unpadded base64 of the hub URL and token", () => {
    const code = encodeWidgetCode("https://hub.example/functions/v1/hub///", "token-123");
    expect(code.startsWith("PLW1.")).toBe(true);
    expect(code.slice(5)).not.toMatch(/[+/=]/);
    expect(decodeCode(code)).toEqual({ u: "https://hub.example/functions/v1/hub", t: "token-123" });
  });

  it("keeps UTF-8 intact", () => {
    const code = encodeWidgetCode("https://hüb.example", "tökén");
    expect(decodeCode(code)).toEqual({ u: "https://hüb.example", t: "tökén" });
  });
});
