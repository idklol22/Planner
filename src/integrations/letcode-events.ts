/** Polling helper for the hub's `GET /events?since=` feed.
 *
 * The hub owns the cursor (an increasing rowid, or an ISO timestamp for older
 * data). This module only filters the page down to `practice.solved` events;
 * applying them to the task store stays in `applySolved`.
 */

import type { EventRecord, HubClient } from "../storage/hub";

export interface EventsPage {
  events: EventRecord[];
  cursor: number | string;
  more?: boolean;
}

/** A client that already exposes the events feed, for callers that prefer to
 *  own the HTTP layer (and for tests). */
export interface EventsClient {
  getEvents(since: number | string): Promise<EventsPage>;
}

/** A client exposing only HubClient's authenticated request method. */
export interface HubRequestClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/** `HubClient` is accepted as-is: its authenticated request method is used
 *  until a public `getEvents` is wired into it. */
export type PracticeEventsClient = HubClient | EventsClient | HubRequestClient;

export interface PracticePollResult {
  events: EventRecord[];
  cursor: number | string;
}

/** Guard against a misbehaving server returning an endless `more: true` page. */
export const EVENTS_MAX_PAGES = 20;

function isPracticeSolved(event: EventRecord): boolean {
  if (!event || typeof event !== "object" || event.type !== "practice.solved") return false;
  return event.source == null || event.source.toLowerCase() === "letcode";
}

async function fetchPage(client: PracticeEventsClient, since: number | string): Promise<EventsPage> {
  if ("getEvents" in client) return client.getEvents(since);
  // HubClient.request is TS-private, but is the same authenticated request
  // used by push/pull/postEvent and is present at runtime.
  return (client as unknown as HubRequestClient).request<EventsPage>(
    `/events?since=${encodeURIComponent(String(since))}`,
  );
}

/** Fetch every new `practice.solved` event after `since` and return the cursor
 *  to resume from. Pages with `more: true` are followed automatically. */
export async function pollPracticeEvents(
  client: PracticeEventsClient,
  since: number | string = 0,
): Promise<PracticePollResult> {
  const events: EventRecord[] = [];
  let cursor: number | string = since;

  for (let page = 0; page < EVENTS_MAX_PAGES; page += 1) {
    const response = await fetchPage(client, cursor);
    for (const event of Array.isArray(response?.events) ? response.events : []) {
      if (isPracticeSolved(event)) events.push(event);
    }
    const next = response?.cursor;
    const advanced =
      typeof next === "number"
        ? Number.isFinite(next) && next > Number(cursor)
        : typeof next === "string" && next > String(cursor);
    if (advanced) cursor = next;
    if (!response?.more || !advanced) break;
  }

  return { events, cursor };
}
