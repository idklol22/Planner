/** Pure parser for the `planner` URL scheme. No React or Capacitor here. */

import type { ISODate } from "../domain/dates";
import { parseHealthUrl, type HealthValues } from "./health";

export type DeepLink =
  | { kind: "today" }
  | { kind: "calories" }
  | { kind: "health"; date: ISODate; values: HealthValues };

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
