/** Pure helpers for the data handed to iPhone Home Screen widgets. */

import type { AppData } from "../domain/model";
import type { WidgetProfile } from "../storage/hub";
import type { ThemeTokens } from "../theme/themes";

/** The widget profile is built from local data only: it never needs the network. */
export function buildWidgetProfile(
  data: AppData,
  themeTokens: ThemeTokens,
  dark: boolean,
): WidgetProfile {
  const rawGoal = data.settings.dailyCalorieGoal;
  const calorieGoal = Number.isFinite(rawGoal)
    ? Math.max(0, Math.min(100_000, Math.round(rawGoal)))
    : 0;
  return {
    calorieGoal,
    theme: {
      bg: themeTokens.bg,
      surface: themeTokens.surface,
      text: themeTokens.text,
      muted: themeTokens.textMuted,
      faint: themeTokens.textFaint,
      accent: themeTokens.accent,
      accentContrast: themeTokens.accentContrast,
      dark,
    },
    goals: data.goals
      .filter((goal) => !goal.deletedAt)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((goal) => ({
        id: goal.id,
        categoryId: goal.categoryId,
        title: goal.title,
        done: Boolean(goal.achievedAt),
        order: goal.order,
      })),
  };
}

/** UTF-8 JSON → unpadded URL-safe base64 (btoa needs a Latin-1 byte string). */
function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `PLW1.` + base64url({"u": hub base url, "t": token}), pasted into the widget. */
export function encodeWidgetCode(url: string, token: string): string {
  const hub = url.trim().replace(/\/+$/, "");
  return `PLW1.${base64url(JSON.stringify({ u: hub, t: token }))}`;
}

// ── Upload queue / background reload ─────────────────────────────────────────

export interface WidgetUploadItem {
  /** Serialized profile; also the identity used to suppress duplicates. */
  json: string;
  value: WidgetProfile;
}

/** Sentinel for "a background reload is armed but no sync has succeeded yet".
 *  `null` keeps meaning "nothing armed"; using it for the first launch would
 *  let a timer reload before the first push was accepted. */
export const BACKGROUND_RELOAD_WAIT_ANY = "";

export interface WidgetUploadState {
  inFlight: WidgetUploadItem | null;
  /** Only the newest profile seen during an upload is kept. */
  pending: WidgetUploadItem | null;
  lastSent: string | null;
}

export function emptyWidgetUploadState(): WidgetUploadState {
  return { inFlight: null, pending: null, lastSent: null };
}

/** Queue a profile for upload. Any profile that changed while a request was in
 *  flight replaces the older pending one, so the newest always reaches the hub. */
export function enqueueWidgetUpload(
  state: WidgetUploadState,
  item: WidgetUploadItem,
): { state: WidgetUploadState; start: WidgetUploadItem | null } {
  if (state.inFlight) {
    // The profile is back to what is already on the wire: forget any queued
    // intermediate edit or the hub would end up showing a superseded profile.
    if (state.inFlight.json === item.json) {
      return { state: { ...state, pending: null }, start: null };
    }
    return { state: { ...state, pending: item }, start: null };
  }
  if (state.lastSent === item.json) {
    return { state: { ...state, pending: null }, start: null };
  }
  return { state: { ...state, inFlight: item, pending: null }, start: item };
}

/** Complete the in-flight request and, if needed, start the newest queued one.
 *  A failed request is not retried immediately with the same JSON; the next
 *  successful sync/profile change will retry it. */
export function finishWidgetUpload(
  state: WidgetUploadState,
  json: string,
  ok: boolean,
): { state: WidgetUploadState; start: WidgetUploadItem | null } {
  if (!state.inFlight || state.inFlight.json !== json) return { state, start: null };
  const lastSent = ok ? json : state.lastSent;
  const pending = state.pending;
  if (pending && pending.json !== json && pending.json !== lastSent) {
    return { state: { inFlight: pending, pending: null, lastSent }, start: pending };
  }
  return { state: { inFlight: null, pending: null, lastSent }, start: null };
}

export interface SyncStamp {
  lastSyncedAt: string | null;
  error: string | null;
}

/** Gate the reload we arm on backgrounding. It may run only after a sync has
 *  been accepted (a new lastSyncedAt with no error), never before. */
export function backgroundReloadDecision(
  pending: string | null,
  status: SyncStamp,
): { pending: string | null; reload: boolean } {
  if (pending === null) return { pending: null, reload: false };
  if (status.error || !status.lastSyncedAt) return { pending, reload: false };
  if (pending !== BACKGROUND_RELOAD_WAIT_ANY && status.lastSyncedAt === pending) {
    return { pending, reload: false };
  }
  return { pending: null, reload: true };
}
