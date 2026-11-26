import { describe, expect, it } from "vitest";
import { toastDurationMs } from "./toast";

describe("toastDurationMs", () => {
  it("honours an explicit duration on an action", () => {
    expect(toastDurationMs({ label: "Undo", run: () => {}, durationMs: 5000 })).toBe(5000);
  });

  it("keeps the 6s default for a plain action and 3.2s for a message", () => {
    expect(toastDurationMs({ label: "Undo", run: () => {} })).toBe(6000);
    expect(toastDurationMs(undefined)).toBe(3200);
  });
});
