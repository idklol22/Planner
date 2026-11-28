import { describe, expect, it } from "vitest";
import {
  decideAppOpen,
  decideLaunchUrl,
  DUPLICATE_WINDOW_MS,
  initialLaunchLinkState,
  parseDeepLink,
} from "./deeplink";

const DAY = "2026-11-27";
const T0 = 1_000_000;
const LATER = T0 + DUPLICATE_WINDOW_MS + 1;

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
    const opened = decideAppOpen(initialLaunchLinkState(), LINK, T0);
    expect(opened.handle).toBe(true);

    const launch = decideLaunchUrl(opened.state, LINK, T0);
    expect(launch.handle).toBe(false); // same link from getLaunchUrl

    const echo = decideAppOpen(launch.state, LINK, T0);
    expect(echo.handle).toBe(false); // the OS duplicate is still suppressed

    const tapAgain = decideAppOpen(echo.state, LINK, LATER);
    expect(tapAgain.handle).toBe(true); // a later real tap still works
  });

  it("handles a launch link once when getLaunchUrl arrives first", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), LINK, T0);
    expect(launch.handle).toBe(true);

    const duplicate = decideAppOpen(launch.state, LINK, T0);
    expect(duplicate.handle).toBe(false);
    expect(decideAppOpen(duplicate.state, LINK, LATER).handle).toBe(true);

    // Duplicate resolutions (StrictMode) never handle it twice.
    expect(decideLaunchUrl(launch.state, LINK, T0).handle).toBe(false);
  });

  it("keeps the launch suppression when a different link arrives first", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), LINK, T0);
    const other = decideAppOpen(launch.state, "planner://today", T0);
    expect(other.handle).toBe(true);
    expect(decideAppOpen(other.state, LINK, T0).handle).toBe(false); // launch echo
    expect(decideAppOpen(other.state, LINK, LATER).handle).toBe(true); // real tap
  });

  it("still handles appUrlOpen when the app was not launched by a link", () => {
    const launch = decideLaunchUrl(initialLaunchLinkState(), null, T0);
    expect(launch.handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK, T0).handle).toBe(true);
  });

  it("does not show the toast twice when getLaunchUrl resolves null", () => {
    const opened = decideAppOpen(initialLaunchLinkState(), LINK, T0);
    expect(opened.handle).toBe(true);
    const launch = decideLaunchUrl(opened.state, null, T0);
    expect(launch.handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK, T0).handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK, LATER).handle).toBe(true);
  });

  it("does not show the toast twice for two appUrlOpen events before getLaunchUrl settles", () => {
    const first = decideAppOpen(initialLaunchLinkState(), LINK, T0);
    expect(first.handle).toBe(true);
    const duplicate = decideAppOpen(first.state, LINK, T0);
    expect(duplicate.handle).toBe(false); // iOS can emit the launch link twice

    const launch = decideLaunchUrl(duplicate.state, LINK, T0);
    expect(launch.handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK, T0).handle).toBe(false);
    expect(decideAppOpen(launch.state, LINK, LATER).handle).toBe(true);
  });
});
