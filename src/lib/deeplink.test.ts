import { describe, expect, it } from "vitest";
import { parseDeepLink } from "./deeplink";

const DAY = "2026-11-27";

describe("parseDeepLink", () => {
  it("parses today and calories", () => {
    expect(parseDeepLink("planner://today", DAY)).toEqual({ kind: "today" });
    expect(parseDeepLink("planner://calories", DAY)).toEqual({ kind: "calories" });
  });

  it("parses a health link with validated values", () => {
    expect(parseDeepLink("planner://health?steps=8,000&sleep=7.5h&hr=nope", DAY)).toEqual({
      kind: "health",
      date: DAY,
      values: { date: DAY, steps: 8000, sleepHours: 7.5 },
    });
  });

  it("returns null for unknown or broken links", () => {
    expect(parseDeepLink("planner://unknown", DAY)).toBeNull();
    expect(parseDeepLink("planner://health?steps=bad", DAY)).toBeNull();
    expect(parseDeepLink("https://example.com/today", DAY)).toBeNull();
    expect(parseDeepLink("not a url", DAY)).toBeNull();
  });
});
