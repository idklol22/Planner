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
