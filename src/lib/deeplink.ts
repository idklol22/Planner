/** Pure parser for the `planner` URL scheme. No React or Capacitor here. */

import type { ISODate } from "../domain/dates";
import { parseHealthUrl, type HealthValues } from "./health";

export type DeepLink =
  | { kind: "today" }
  | { kind: "calories" }
  | { kind: "health"; date: ISODate; values: HealthValues };

export interface LaunchLinkState {
  /** `getLaunchUrl` has settled (its URL may be null). */
  resolved: boolean;
  /** Canonical URL the app was launched with, if any. */
  key: string | null;
  /** A launch (or pre-launch open) link has already been handled once. */
  handled: boolean;
  /** The duplicate appUrlOpen for the launch link has been consumed. */
  duplicateConsumed: boolean;
  /** Last link handled by appUrlOpen before the launch URL was known. */
  openedBeforeLaunch: string | null;
}

export function initialLaunchLinkState(): LaunchLinkState {
  return {
    resolved: false,
    key: null,
    handled: false,
    duplicateConsumed: false,
    openedBeforeLaunch: null,
  };
}

function linkKey(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

/** An `appUrlOpen` event for the launch URL is the same link as `getLaunchUrl`.
 *  Only that first duplicate is suppressed; a later real tap still goes through. */
export function decideAppOpen(
  state: LaunchLinkState,
  url: string,
): { state: LaunchLinkState; handle: boolean } {
  const key = linkKey(url);
  if (!state.resolved) {
    return {
      state: { ...state, openedBeforeLaunch: key, handled: true },
      handle: true,
    };
  }
  if (state.handled && state.key === key && !state.duplicateConsumed) {
    return { state: { ...state, duplicateConsumed: true }, handle: false };
  }
  // Any other open ends the launch-duplicate window.
  return { state: { ...state, duplicateConsumed: true }, handle: true };
}

/** Handle a `getLaunchUrl` result at most once, even under StrictMode remounts. */
export function decideLaunchUrl(
  state: LaunchLinkState,
  url: string | null,
): { state: LaunchLinkState; handle: boolean } {
  if (state.resolved) return { state, handle: false };
  const key = url ? linkKey(url) : null;
  const alreadyHandled = key !== null && state.handled && state.openedBeforeLaunch === key;
  return {
    state: {
      resolved: true,
      key,
      handled: alreadyHandled || key !== null,
      duplicateConsumed: alreadyHandled,
      openedBeforeLaunch: state.openedBeforeLaunch,
    },
    handle: !alreadyHandled && key !== null,
  };
}

/** Accepts `planner://today`, `planner://calories` and `planner://health?...`.
 *  Unknown links and invalid health links return null. */
export function parseDeepLink(url: string, today: ISODate): DeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol.toLowerCase() !== "planner:") return null;

  const target = (parsed.hostname || parsed.pathname.replace(/^\/+/, "").split("/")[0] || "").toLowerCase();
  if (target === "today") return { kind: "today" };
  if (target === "calories") return { kind: "calories" };
  if (target !== "health") return null;

  const health = parseHealthUrl(url, today);
  if (!health) return null;
  return { kind: "health", date: health.date, values: health };
}
