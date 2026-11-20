/** Ten muted category accents, derived from LetCode's sage / sand / rose tokens.
 *  Mirrors --cat-1..10 in src/theme.css. */
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
