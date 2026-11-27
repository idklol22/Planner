import { describe, expect, it } from "vitest";
import { dayAriaLabel, dayMark } from "./calendarStatus";

describe("dayMark", () => {
  it("shows nothing for an empty day", () => {
    expect(dayMark(0, 0)).toBe("none");
  });

  it("shows an open dot whenever a task is still open", () => {
    expect(dayMark(1, 0)).toBe("open");
    expect(dayMark(4, 3)).toBe("open");
  });

  it("shows the done outline only when every task is done", () => {
    expect(dayMark(1, 1)).toBe("done");
    expect(dayMark(4, 4)).toBe("done");
  });
});

describe("dayAriaLabel", () => {
  it("keeps the plain date name when there are no tasks", () => {
    expect(dayAriaLabel("Monday, 4 November", 0, 0)).toBe("Monday, 4 November");
  });

  it("puts the open count in the label", () => {
    expect(dayAriaLabel("Monday, 4 November", 4, 1)).toBe(
      "Monday, 4 November, 3 open, 1 of 4 done",
    );
  });

  it("reports zero open when everything is done", () => {
    expect(dayAriaLabel("Monday, 4 November", 4, 4)).toContain("0 open");
  });
});
