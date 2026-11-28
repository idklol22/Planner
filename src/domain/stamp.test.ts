import { describe, expect, it } from "vitest";
import { newerStamp } from "./stamp";

describe("newerStamp", () => {
  const earlier = "2026-11-28T10:00:00.000Z";
  const later = "2026-11-28T10:00:01.000Z";

  it("keeps the current stamp when it is already newer", () => {
    expect(newerStamp(later, earlier)).toBe(later);
  });

  it("advances by a millisecond on an equal or older previous stamp", () => {
    expect(newerStamp(earlier, earlier)).toBe("2026-11-28T10:00:00.001Z");
    expect(newerStamp(earlier, later)).toBe("2026-11-28T10:00:01.001Z");
  });
});
