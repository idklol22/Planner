import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { contrastRatio, inkOn, parseHex } from "./contrast";
import { THEME_IDS, THEME_LIST, themeCss, type ThemeDef } from "./themes";

describe("contrastRatio", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#336699", "#ffeedd")).toBeCloseTo(contrastRatio("#ffeedd", "#336699"), 10);
  });
});

describe("theme list", () => {
  it("has wabi plus all 14 LetCode themes", () => {
    expect([...THEME_IDS].sort()).toEqual(
      ["wabi", "midnight", "smoke", "graphite", "contrast", "red", "orange", "ember", "emerald", "ocean", "sapphire", "citrus", "blue", "nimbus", "uzumaki"].sort(),
    );
  });
  it("high contrast has no glass and no scene", () => {
    const c = THEME_LIST.find((t) => t.id === "contrast")!;
    expect(c.glass).toBe(false);
    expect(c.scene).toBeUndefined();
    expect(c.focusWidth).toBeGreaterThanOrEqual(3);
  });
  it("tokens.css is in sync with themes.ts (run: node scripts/gen-theme-css.ts)", async () => {
    // The project has no @types/node, so load fs dynamically.
    const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
    const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    expect(tokensCss.split("\r\n").join("\n")).toBe(themeCss());
  });
  it("index.html's pre-paint script matches the theme definitions", () => {
    const html = indexHtml;
    const list = (name: string): string[] => {
      const start = html.indexOf(`var ${name} = [`) + `var ${name} = `.length;
      return JSON.parse(html.slice(start, html.indexOf("]", start) + 1));
    };
    expect(list("ALL")).toEqual(THEME_LIST.map((t) => t.id));
    expect(list("SCENES")).toEqual(THEME_LIST.filter((t) => t.scene).map((t) => t.id));
    expect(list("GLASS")).toEqual(THEME_LIST.filter((t) => t.glass).map((t) => t.id));
    const bg = JSON.parse(/var BG = (\{[^}]*\})/.exec(html)![1].replace(/(\w+):/g, '"$1":'));
    for (const t of THEME_LIST) expect(bg[t.id]).toBe(t.tokens.bg);
  });
});

function check(t: ThemeDef, a: keyof ThemeDef["tokens"], b: keyof ThemeDef["tokens"], min: number) {
  const r = contrastRatio(t.tokens[a], t.tokens[b]);
  expect(r, `${t.id}: ${a} on ${b} = ${r.toFixed(2)} (need ${min})`).toBeGreaterThanOrEqual(min);
}

describe.each(THEME_LIST.map((t) => [t.id, t] as const))("%s readability", (_id, t) => {
  it("uses opaque hex for every tested token", () => {
    for (const k of ["bg", "surface", "surface2", "surfaceRaised", "borderStrong", "text", "textMuted", "textFaint", "accent", "accentContrast", "focus", "danger", "success", "warning", "sat", "sun", "flower"] as const) {
      expect(parseHex(t.tokens[k]), `${t.id}.${k}`).not.toBeNull();
    }
  });
  it("text >= 7:1 on bg and surface", () => {
    check(t, "text", "bg", 7);
    check(t, "text", "surface", 7);
    check(t, "text", "surface2", 7);
    check(t, "text", "surfaceRaised", 7);
  });
  it("muted text >= 4.5:1 on bg and surfaces", () => {
    check(t, "textMuted", "bg", 4.5);
    check(t, "textMuted", "surface", 4.5);
    check(t, "textMuted", "surface2", 4.5);
    check(t, "textMuted", "surfaceRaised", 4.5);
  });
  it("faint text >= 3:1 on bg and surfaces", () => {
    check(t, "textFaint", "bg", 3);
    check(t, "textFaint", "surface", 3);
    check(t, "textFaint", "surface2", 3);
  });
  it("accent-contrast on accent >= 4.5:1, accent itself >= 3:1 on surface", () => {
    check(t, "accentContrast", "accent", 4.5);
    check(t, "accent", "surface", 3);
  });
  it("strong border >= 3:1 on surface and surface-2; focus >= 3:1 on bg and surface", () => {
    check(t, "borderStrong", "surface", 3);
    check(t, "borderStrong", "surface2", 3);
    check(t, "focus", "bg", 3);
    check(t, "focus", "surface", 3);
  });
  it("danger / success / warning are readable as text (>= 4.5:1) on surface", () => {
    check(t, "danger", "surface", 4.5);
    check(t, "success", "surface", 4.5);
    check(t, "warning", "surface", 4.5);
  });
  it("weekend colours are readable (>= 4.5:1) on the calendar tile", () => {
    check(t, "sat", "surface", 4.5);
    check(t, "sun", "surface", 4.5);
    check(t, "sat", "bg", 4.5);
    check(t, "sun", "bg", 4.5);
  });
  it("empty flower is visible but quiet (1.2 to 4:1 on surface)", () => {
    const r = contrastRatio(t.tokens.flower, t.tokens.surface);
    expect(r).toBeGreaterThanOrEqual(1.2);
    expect(r).toBeLessThanOrEqual(4);
    check(t, "text", "flower", 4.5); // the open-task count is drawn on the blob
  });
  it("danger is not confused with the accent", () => {
    expect(t.tokens.danger.toLowerCase()).not.toBe(t.tokens.accent.toLowerCase());
  });
});

describe("inkOn", () => {
  it("always gives >= 4.5:1", () => {
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      expect(contrastRatio(hex, inkOn(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
