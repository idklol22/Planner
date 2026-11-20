import { describe, expect, it } from "vitest";
import { autostartError, autostartLabel } from "./autostart";

describe("autostartLabel", () => {
  it("reports the enabled state once settled", () => {
    expect(autostartLabel(true, false)).toBe("On");
    expect(autostartLabel(false, false)).toBe("Off");
  });

  it("shows the busy label for either value", () => {
    expect(autostartLabel(true, true)).toBe("Checking…");
    expect(autostartLabel(false, true)).toBe("Checking…");
  });
});

describe("autostartError", () => {
  it("keeps an ordinary error message verbatim", () => {
    expect(autostartError("x")).toBe("x");
    expect(autostartError(new Error("denied"))).toBe("denied");
  });
});
