import { describe, expect, it } from "vitest";
import { defaultData, makeGoal } from "../domain/model";
import { THEMES } from "../theme/themes";
import {
  backgroundReloadDecision,
  buildWidgetProfile,
  emptyWidgetUploadState,
  encodeWidgetCode,
  enqueueWidgetUpload,
  finishWidgetUpload,
  type WidgetUploadItem,
} from "./widget";

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

describe("widget upload queue", () => {
  const base = buildWidgetProfile(defaultData(), TOKENS, false);
  const item = (calorieGoal: number): WidgetUploadItem => ({
    json: JSON.stringify({ ...base, calorieGoal }),
    value: { ...base, calorieGoal },
  });

  it("starts the first profile and replaces newer changes made during an upload", () => {
    const first = item(2000);
    const queued = enqueueWidgetUpload(emptyWidgetUploadState(), first);
    expect(queued.start).toEqual(first);

    const second = item(2100);
    const third = item(2200);
    const afterSecond = enqueueWidgetUpload(queued.state, second);
    expect(afterSecond.start).toBeNull();
    const afterThird = enqueueWidgetUpload(afterSecond.state, third);
    expect(afterThird.state.pending).toEqual(third);

    const settled = finishWidgetUpload(afterThird.state, first.json, true);
    expect(settled.start).toEqual(third); // not the superseded 2100 profile
    expect(settled.state.inFlight).toEqual(third);
    const done = finishWidgetUpload(settled.state, third.json, true);
    expect(done.start).toBeNull();
    expect(done.state.lastSent).toBe(third.json);
    expect(done.state.pending).toBeNull();
  });

  it("does not resend an unchanged profile, but does not drop a newer one on failure", () => {
    const first = item(2000);
    const started = enqueueWidgetUpload(emptyWidgetUploadState(), first);
    expect(enqueueWidgetUpload(started.state, first).start).toBeNull();

    const failed = finishWidgetUpload(started.state, first.json, false);
    expect(failed.start).toBeNull();
    expect(failed.state.lastSent).toBeNull();

    const second = item(2100);
    const queued = enqueueWidgetUpload(started.state, second);
    const retried = finishWidgetUpload(queued.state, first.json, false);
    expect(retried.start).toEqual(second);
  });
});

describe("backgroundReloadDecision", () => {
  it("waits for a successful sync after backgrounding and reloads only once", () => {
    expect(backgroundReloadDecision(null, { lastSyncedAt: null, error: null })).toEqual({
      pending: null,
      reload: false,
    });

    const pending = "2026-11-27T10:00:00.000Z";
    expect(
      backgroundReloadDecision(pending, { lastSyncedAt: pending, error: null }),
    ).toEqual({ pending, reload: false });
    expect(
      backgroundReloadDecision(pending, {
        lastSyncedAt: "2026-11-27T11:00:00.000Z",
        error: "offline",
      }),
    ).toEqual({ pending, reload: false });

    const released = backgroundReloadDecision(pending, {
      lastSyncedAt: "2026-11-27T11:00:00.000Z",
      error: null,
    });
    expect(released).toEqual({ pending: null, reload: true });
    expect(
      backgroundReloadDecision(released.pending, {
        lastSyncedAt: "2026-11-27T12:00:00.000Z",
        error: null,
      }),
    ).toEqual({ pending: null, reload: false });
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
