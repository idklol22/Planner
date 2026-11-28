import { describe, expect, it } from "vitest";
import {
  decideAppOpen,
  decideLaunchUrl,
  initialLaunchLinkState,
  parseDeepLink,
} from "./deeplink";

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

describe("launch link deduplication", () => {
  const LINK = "planner://health?steps=8000";

  it("handles a launch link once when appUrlOpen arrives first", () => {
    const opened = decideAppOpen(initialLaunchLinkState(), LINK);
    expect(opened.handle).toBe(true);

    const launch = decideLaunchUrl(opened.state, LINK);
    expect(launch.handle).toBe(false); // same link from getLaunchUrl

    const tapAgain = decideAppOpen(launch.state, LINK);
    expect(tapAgain.handle).toBe(true); // a later real tap still works
  });

  it("handles a launch link once when getLaunchUrl arrives first", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), LINK);
    expect(launch.handle).toBe(true);

    const duplicate = decideAppOpen(launch.state, LINK);
    expect(duplicate.handle).toBe(false);
    expect(decideAppOpen(duplicate.state, LINK).handle).toBe(true);

    // Duplicate resolutions (StrictMode) never handle it twice.
    expect(decideLaunchUrl(launch.state, LINK).handle).toBe(false);
  });

  it("does not suppress a different link or a later tap after other links", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), LINK);
    const other = decideAppOpen(launch.state, "planner://today");
    expect(other.handle).toBe(true);
    expect(decideAppOpen(other.state, LINK).handle).toBe(true);
  });

  it("still handles appUrlOpen when the app was not launched by a link", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), null);
    expect(launch.handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK).handle).toBe(true);
  });
});
