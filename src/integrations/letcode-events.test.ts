import { afterEach, describe, expect, it, vi } from "vitest";
import { HubClient, type EventRecord } from "../storage/hub";
import {
  pollPracticeEvents,
  type EventsClient,
  type EventsPage,
} from "./letcode-events";

function event(type: string, id: string, source: string | null = "letcode"): EventRecord {
  return {
    id,
    type,
    source,
    origin: null,
    payload: { problemId: 125, title: "Valid Palindrome" },
    ts: "2026-11-20T10:00:00.000Z",
    idempotencyKey: `key-${id}`,
  };
}

describe("pollPracticeEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only practice.solved events and the new cursor", async () => {
    const first: EventRecord[] = [event("practice.solved", "a"), event("harness.mirrored", "b")];
    const second: EventRecord[] = [event("practice.solved", "c", "web"), event("practice.solved", "d")];
    const getEvents = vi
      .fn<(_since: number | string) => Promise<EventsPage>>()
      .mockResolvedValueOnce({ events: first, cursor: 10, more: true })
      .mockResolvedValueOnce({ events: second, cursor: 23, more: false });
    const client: EventsClient = { getEvents };

    const result = await pollPracticeEvents(client, 4);

    expect(result.events.map((entry) => entry.id)).toEqual(["a", "d"]);
    expect(result.cursor).toBe(23);
    expect(getEvents.mock.calls).toEqual([[4], [10]]);
  });

  it("uses the authenticated hub GET /events?since= endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      const body = JSON.stringify({
        events: [event("practice.solved", "e")],
        cursor: 31,
        more: false,
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new HubClient("https://hub.example/", "token-1");

    const result = await pollPracticeEvents(client, 12);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hub.example/events?since=12");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-1");
    expect(result.events).toHaveLength(1);
    expect(result.cursor).toBe(31);
  });
});
