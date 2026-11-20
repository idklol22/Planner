import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, nearestCategoryColor } from "./palette";

describe("nearestCategoryColor", () => {
  it("keeps palette colours unchanged", () => {
    for (const c of CATEGORY_COLORS) expect(nearestCategoryColor(c)).toBe(c);
  });
  it("maps old bright colours into the new palette", () => {
    const old = ["#FF6B6B", "#FFD166", "#34D399", "#38BDF8", "#8B7CFF", "#F472B6", "#ffffff", "#000"];
    for (const c of old) expect(CATEGORY_COLORS).toContain(nearestCategoryColor(c) as never);
    expect(["#8bb39d", "#7fb0aa"]).toContain(nearestCategoryColor("#34D399"));
    expect(nearestCategoryColor("#FF6B6B")).toBe("#c98a94");
    expect(["#8f9bc9", "#a99bc7"]).toContain(nearestCategoryColor("#8B7CFF"));
  });
  it("falls back for invalid input", () => {
    expect(nearestCategoryColor("nope")).toBe(CATEGORY_COLORS[0]);
  });
});
