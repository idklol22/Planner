import { describe, expect, it } from "vitest";
import { isSafetyCopyError, SafetyCopyError } from "../storage/port";
import { saveBlockedMessage } from "./store";

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
