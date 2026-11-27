import { describe, expect, it } from "vitest";
import { INBOX_KEY } from "../domain/daySections";
import {
  canAddGoal,
  composerPlaceholder,
  lastComposerTarget,
  normalizeComposerTarget,
  rememberComposerTarget,
} from "./Composer";

describe("composer helpers", () => {
  it("uses the matching placeholder for each item type", () => {
    expect(composerPlaceholder("task")).toBe("New task");
    expect(composerPlaceholder("goal")).toBe("New goal");
  });

  it("never offers goals for Inbox", () => {
    expect(canAddGoal(null)).toBe(false);
    expect(canAddGoal("cat_1")).toBe(true);
  });

  it("normalises every spelling of Inbox to null", () => {
    expect(normalizeComposerTarget(null)).toBeNull();
    expect(normalizeComposerTarget(undefined)).toBeNull();
    expect(normalizeComposerTarget("")).toBeNull();
    expect(normalizeComposerTarget(INBOX_KEY)).toBeNull();
    expect(normalizeComposerTarget("cat_1")).toBe("cat_1");
  });

  it("remembers the last list for the session", () => {
    rememberComposerTarget("cat_7");
    expect(lastComposerTarget()).toBe("cat_7");
    rememberComposerTarget(null);
    expect(lastComposerTarget()).toBeNull();
  });
});
