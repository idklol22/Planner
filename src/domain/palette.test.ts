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

import { THEME_LIST, THEMES } from "../theme/themes";
import { contrastRatio, inkOn, parseHex, rgbToHsl } from "../theme/contrast";
import { adjustForTheme, categoryColorFor, paletteFor } from "./palette";

describe("per-theme category palette", () => {
  it("leaves the default theme's colours untouched", () => {
    expect(paletteFor("midnight")).toEqual([...CATEGORY_COLORS]);
  });
  for (const t of THEME_LIST) {
    it(`${t.id}: every colour reads as text (>= 4.5:1, swatch >= 3:1) on surface, surface-2 and bg`, () => {
      for (const base of CATEGORY_COLORS) {
        const c = adjustForTheme(base, t.id);
        for (const bg of [t.tokens.surface, t.tokens.surface2, t.tokens.bg]) {
          expect(contrastRatio(c, bg), `${t.id} ${base}->${c} on ${bg}`).toBeGreaterThanOrEqual(t.id === "contrast" ? 7 : 4.5);
        }
        expect(contrastRatio(c, inkOn(c))).toBeGreaterThanOrEqual(4.5); // label/check drawn on a filled swatch
      }
    });
    it(`${t.id}: hue is preserved and the ten colours stay distinct`, () => {
      const out = paletteFor(t.id);
      expect(new Set(out).size).toBe(10);
      out.forEach((c, i) => {
        const [h0, s0] = rgbToHsl(parseHex(CATEGORY_COLORS[i])!);
        const [h1, s1] = rgbToHsl(parseHex(c)!);
        if (s0 > 0.05 && s1 > 0.05) {
          const d = Math.abs(h0 - h1);
          expect(Math.min(d, 360 - d)).toBeLessThan(8);
        }
      });
    });
  }
  it("light themes get darker colours, dark themes stay light", () => {
    const lum = (c: string) => rgbToHsl(parseHex(c)!)[2];
    expect(lum(adjustForTheme("#cdb98e", "blue"))).toBeLessThan(lum("#cdb98e"));
    expect(THEMES.blue.dark).toBe(false);
  });
  it("maps stored colours through the nearest palette entry first", () => {
    expect(categoryColorFor("#FF6B6B", "midnight")).toBe("#c98a94");
    expect(categoryColorFor("#FF6B6B", "blue")).toBe(adjustForTheme("#c98a94", "blue"));
  });
});
