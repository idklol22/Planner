/** Pure parser for the `planner` URL scheme. No React or Capacitor here. */

import type { ISODate } from "../domain/dates";
import { parseHealthUrl, type HealthValues } from "./health";

export type DeepLink =
  | { kind: "today" }
  | { kind: "calories" }
  | { kind: "health"; date: ISODate; values: HealthValues };

/** How long a link stays "recently handled". iOS can deliver the same launch
 *  link through both `appUrlOpen` and `getLaunchUrl`; a short window suppresses
 *  that duplicate without swallowing a genuinely new tap minutes later. */
export const DUPLICATE_WINDOW_MS = 2_000;

export interface LaunchLinkState {
  /** `getLaunchUrl` has settled (its URL may be null). */
  resolved: boolean;
  /** Canonical URL the app was launched with, if any. */
  key: string | null;
  /** Recently handled links: one matching duplicate may be suppressed. */
  suppressedUntil: Record<string, number>;
  /** Links already handled this session (used when getLaunchUrl echoes one). */
  handledUntil: Record<string, number>;
}

export function initialLaunchLinkState(): LaunchLinkState {
  return { resolved: false, key: null, suppressedUntil: {}, handledUntil: {} };
}

function linkKey(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

function prune(entries: Record<string, number>, at: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, until] of Object.entries(entries)) if (until > at) out[key] = until;
  return out;
}

/** Consume one pending duplicate for this exact link, if there is one. */
function consumeDuplicate(
  state: LaunchLinkState,
  key: string,
  at: number,
): { state: LaunchLinkState; duplicate: boolean } {
  const until = state.suppressedUntil[key];
  if (until === undefined || until <= at) return { state, duplicate: false };
  const suppressedUntil = { ...state.suppressedUntil };
  delete suppressedUntil[key];
  return { state: { ...state, suppressedUntil }, duplicate: true };
}

function markHandled(state: LaunchLinkState, key: string, at: number): LaunchLinkState {
  const until = at + DUPLICATE_WINDOW_MS;
  return {
    ...state,
    suppressedUntil: { ...state.suppressedUntil, [key]: until },
    handledUntil: { ...state.handledUntil, [key]: until },
  };
}

/** An `appUrlOpen` event for a recently handled link is the OS echo of that
 *  link; consume it once. Any later tap of the same link is a real new tap. */
export function decideAppOpen(
  state: LaunchLinkState,
  url: string,
  at: number = Date.now(),
): { state: LaunchLinkState; handle: boolean } {
  const key = linkKey(url);
  const fresh = { ...state, suppressedUntil: prune(state.suppressedUntil, at) };
  const duplicate = consumeDuplicate(fresh, key, at);
  if (duplicate.duplicate) return { state: duplicate.state, handle: false };
  return { state: markHandled(duplicate.state, key, at), handle: true };
}

/** Handle a `getLaunchUrl` result at most once, even when it resolves null
 *  after an `appUrlOpen` or under StrictMode remounts. */
export function decideLaunchUrl(
  state: LaunchLinkState,
  url: string | null,
  at: number = Date.now(),
): { state: LaunchLinkState; handle: boolean } {
  if (state.resolved) return { state, handle: false };
  const key = url ? linkKey(url) : null;
  const base: LaunchLinkState = {
    resolved: true,
    key,
    suppressedUntil: prune(state.suppressedUntil, at),
    handledUntil: prune(state.handledUntil, at),
  };
  // A null launch URL must not forget a link already handled by appUrlOpen,
  // even if its one appUrlOpen echo was already consumed.
  // Keep the suppression entry: the OS may still deliver that echo.
  if (key !== null && (base.handledUntil[key] !== undefined || base.suppressedUntil[key] !== undefined)) {
    const until = base.handledUntil[key] ?? base.suppressedUntil[key]!;
    return {
      state: { ...base, suppressedUntil: { ...base.suppressedUntil, [key]: until } },
      handle: false,
    };
  }
  if (key === null) return { state: base, handle: false };
  return { state: markHandled(base, key, at), handle: true };
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
