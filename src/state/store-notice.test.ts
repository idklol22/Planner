import { describe, expect, it } from "vitest";
import { isSafetyCopyError, SafetyCopyError } from "../storage/port";
import { recoveryMessage, saveBlockedMessage } from "./store";
import type { LoadIssue } from "../storage/port";

describe("the notice shown while saves are held", () => {
  it("says plainly that changes are not saved because no backup could be made", () => {
    const message = saveBlockedMessage("backup");
    expect(message).toContain("not being saved");
    expect(message).toContain("could not be backed up");
    expect(message).toContain("storage may be full");
  });

  it("does not claim a backup was kept when the store could not be read", () => {
    const message = saveBlockedMessage("read");
    expect(message).toContain("could not be read");
    expect(message).toContain("not being saved");
    expect(message.toLowerCase()).not.toContain("backup was kept");
    expect(message.toLowerCase()).not.toContain("kept as a backup");
  });

  it("reports which failure is holding saves", () => {
    expect(isSafetyCopyError(new SafetyCopyError("backup"))).toBe(true);
    expect(new SafetyCopyError("read").reason).toBe("read");
    expect(isSafetyCopyError(new Error("nope"))).toBe(false);
  });
});

describe("the load report", () => {
  const issue = (over: Partial<LoadIssue>): LoadIssue => ({
    reason: "partial",
    dropped: 0,
    repairedSettings: [],
    quarantinedKeys: [],
    ...over,
  });

  it("does not claim the original was backed up when only dropped records were copied", () => {
    const message = recoveryMessage(issue({ dropped: 2, quarantinedKeys: ["q1", "q2"] }));
    expect(message.toLowerCase()).not.toContain("original was kept as a backup");
    expect(message).toContain("2 skipped");
    expect(message).toContain("Copies of those items");
  });

  it("still says so when a whole-store copy really was made", () => {
    expect(recoveryMessage(issue({ reason: "unreadable" }))).toContain("kept as a backup");
    expect(recoveryMessage(issue({ reason: "unreadable", quarantinedKeys: ["q"] }))).toContain(
      "original was copied aside",
    );
  });
});
