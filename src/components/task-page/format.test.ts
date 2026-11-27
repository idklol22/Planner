import { describe, expect, it } from "vitest";
import { formatTaskDate } from "./format";

describe("formatTaskDate", () => {
  it("formats an ISO date as a short weekday, day and month", () => {
    expect(formatTaskDate("2026-11-27")).toBe("Fri 27 Nov");
  });

  it("leaves an empty or malformed value alone", () => {
    expect(formatTaskDate("")).toBe("");
    expect(formatTaskDate("not a date")).toBe("not a date");
  });
});
