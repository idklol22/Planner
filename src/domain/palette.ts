import { contrastRatio, hslToRgb, parseHex, rgbToHsl, toHex } from "../theme/contrast";
import { THEMES, type ThemeId } from "../theme/themes";

/** Ten muted category accents, derived from LetCode's sage / sand / rose tokens.
 *  Per-theme re-lighting lives in categoryColorFor below. */
export const CATEGORY_COLORS = [
  "#c98a94", // rose
  "#d39a8a", // clay
  "#cdb98e", // sand
  "#b3bf8a", // olive
  "#8bb39d", // sage
  "#7fb0aa", // teal
  "#86a8c4", // steel
  "#8f9bc9", // periwinkle
  "#a99bc7", // lavender
  "#c595b5", // mauve
] as const;

function rgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Maps any saved colour (old bright palette or custom) to the nearest palette entry. Pure. */
export function nearestCategoryColor(color: string): string {
  const src = rgb(color);
  if (!src) return CATEGORY_COLORS[0];
  const exact = CATEGORY_COLORS.find((c) => c === color.toLowerCase());
  if (exact) return exact;
  let best: string = CATEGORY_COLORS[0];
  let bestD = Infinity;
  for (const c of CATEGORY_COLORS) {
    const p = rgb(c)!;
    // Weighted RGB distance ("redmean") tracks perceived difference better than plain Euclidean.
    const rm = (src[0] + p[0]) / 2;
    const dr = src[0] - p[0];
    const dg = src[1] - p[1];
    const db = src[2] - p[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ── Per-theme adjustment ────────────────────────────────────────────────────────────────────────
// The ten base colours are tuned for the dark default. Every other theme re-lights them (same hue and
// saturation, lightness only) so the colour reads as text (>= 4.5:1, so the swatch is also >= 3:1) on that
// theme's surface, surface-2 and background. A colour that already passes is returned unchanged.

const MIN_TEXT = 4.5;
const MIN_TEXT_STRONG = 7;

function lit(hex: string, l: number): string {
  const [h, s] = rgbToHsl(parseHex(hex)!);
  return toHex(hslToRgb([h, s, l]));
}

/** Adjusts one palette colour for a theme. Pure. */
export function adjustForTheme(base: string, themeId: ThemeId): string {
  const theme = THEMES[themeId];
  const bgs = [theme.tokens.surface, theme.tokens.surface2, theme.tokens.bg, theme.tokens.surfaceRaised];
  const need = themeId === "contrast" ? MIN_TEXT_STRONG : MIN_TEXT;
  const ok = (c: string) => bgs.every((b) => contrastRatio(c, b) >= need);
  if (ok(base)) return base;
  const [, , l0] = rgbToHsl(parseHex(base)!);
  const dir = theme.dark ? 1 : -1;
  for (let step = 1; step <= 100; step++) {
    const l = Math.min(1, Math.max(0, l0 + (dir * step) / 100));
    const c = lit(base, l);
    if (ok(c)) return c;
  }
  return theme.dark ? "#ffffff" : "#000000";
}

/** The colour a stored category colour should be drawn in under a theme (nearest palette entry, re-lit). */
export function categoryColorFor(color: string, themeId: ThemeId): string {
  return adjustForTheme(nearestCategoryColor(color), themeId);
}

/** The ten palette colours as drawn under a theme. */
export function paletteFor(themeId: ThemeId): string[] {
  return CATEGORY_COLORS.map((c) => adjustForTheme(c, themeId));
}
