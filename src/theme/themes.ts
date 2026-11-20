import { contrastRatio } from "./contrast.ts";

/** Semantic role tokens. Every component uses only these (via src/theme.css); no component hard-codes a colour. */
export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  surfaceRaised: string;
  /** Decorative divider; may be translucent. */
  border: string;
  /** Visible edge of a control; opaque, >= 3:1 against the surface. */
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Text drawn on top of the accent. */
  accentContrast: string;
  focus: string;
  danger: string;
  success: string;
  warning: string;
  selection: string;
  /** Veil behind text/overlays that sit over a scene. */
  scrim: string;
  shadow: string;
  /** Saturday / Sunday day-of-week colours on the calendar. */
  sat: string;
  sun: string;
  /** Unfilled flower / calendar blob. */
  flower: string;
}

export type SceneKind = "particles" | "smoke" | "clouds" | "uzumaki";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** Background scene drawn on a fixed canvas behind the app. */
  scene?: SceneKind;
  /** Glass tiles start on for this theme (never for high contrast). */
  glass: boolean;
  /** Focus ring width in px. */
  focusWidth: number;
  tokens: ThemeTokens;
}

export const THEME_IDS = [
  "midnight",
  "smoke",
  "graphite",
  "contrast",
  "red",
  "orange",
  "ember",
  "emerald",
  "ocean",
  "sapphire",
  "citrus",
  "blue",
  "nimbus",
  "uzumaki",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "midnight";

const SH = "0 20px 60px rgba(0,0,0,0.65)";

type Row = [
  bg: string,
  surface: string,
  surface2: string,
  raised: string,
  border: string,
  borderStrong: string,
  text: string,
  muted: string,
  faint: string,
  accent: string,
  accentContrast: string,
  focus: string,
  danger: string,
  success: string,
  warning: string,
  selection: string,
  scrim: string,
  shadow: string,
  sat: string,
  sun: string,
  flower: string,
];

function tokens(r: Row): ThemeTokens {
  return {
    bg: r[0],
    surface: r[1],
    surface2: r[2],
    surfaceRaised: r[3],
    border: r[4],
    borderStrong: r[5],
    text: r[6],
    textMuted: r[7],
    textFaint: r[8],
    accent: r[9],
    accentContrast: r[10],
    focus: r[11],
    danger: r[12],
    success: r[13],
    warning: r[14],
    selection: r[15],
    scrim: r[16],
    shadow: r[17],
    sat: r[18],
    sun: r[19],
    flower: r[20],
  };
}

function def(
  id: ThemeId,
  name: string,
  opts: { dark?: boolean; scene?: SceneKind; glass?: boolean; focusWidth?: number },
  row: Row,
): ThemeDef {
  return {
    id,
    name,
    dark: opts.dark ?? true,
    scene: opts.scene,
    glass: opts.glass ?? false,
    focusWidth: opts.focusWidth ?? 2,
    tokens: tokens(row),
  };
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  midnight: def("midnight", "Midnight", { scene: "particles", glass: true }, [
    "#060606", "#0e0e0f", "#151516", "#1e1e20",
    "rgba(255,255,255,0.08)", "#68686c",
    "#f2f2f2", "#a9a9ab", "#7c7c80",
    "#d8d8da", "#070707", "#e6e6e8",
    "#d39a96", "#9fc4ad", "#cdb98e",
    "rgba(255,255,255,0.28)", "rgba(6,6,6,0.78)", SH,
    "#86a8c4", "#c98a94", "#2c2c2f",
  ]),
  smoke: def("smoke", "Smoke", { scene: "smoke", glass: true }, [
    "#0a0a0b", "#141415", "#1b1b1d", "#252527",
    "rgba(255,255,255,0.09)", "#707075",
    "#f0f0f1", "#acacb0", "#85858a",
    "#d0d0d4", "#08080a", "#e2e2e6",
    "#d6a09c", "#a3c7b0", "#d0bd93",
    "rgba(255,255,255,0.28)", "rgba(10,10,11,0.78)", SH,
    "#8fb0cc", "#cf929c", "#333336",
  ]),
  graphite: def("graphite", "Graphite", {}, [
    "#1c1d20", "#232427", "#2a2b2f", "#34353a",
    "#303136", "#7a7d85",
    "#e8e8ea", "#aeb0b6", "#8c8f97",
    "#e8e8ea", "#1c1d20", "#f0f0f2",
    "#e3a3a0", "#a6cdb4", "#d8c496",
    "rgba(255,255,255,0.26)", "rgba(28,29,32,0.8)", "0 18px 50px rgba(0,0,0,0.4)",
    "#8fb0cc", "#d39ba4", "#3c3d43",
  ]),
  contrast: def("contrast", "High contrast", { focusWidth: 3 }, [
    "#000000", "#000000", "#0d0d0d", "#1a1a1a",
    "#6a6a6a", "#c8c8c8",
    "#ffffff", "#e2e2e2", "#b4b4b4",
    "#ffe066", "#000000", "#ffe066",
    "#ff7a8a", "#5dffa0", "#ffd24a",
    "rgba(255,224,102,0.45)", "rgba(0,0,0,0.92)", "none",
    "#7fc4ff", "#ff9fc0", "#4a4a4a",
  ]),
  // Saturated themes: neutral muted text, and a danger colour that is not the accent's hue.
  red: def("red", "Red", {}, [
    "#0b0707", "#130c0c", "#1b1010", "#271716",
    "#2b1a19", "#82605c",
    "#f1e9e6", "#b8b0ae", "#8f8785",
    "#f2452b", "#140403", "#ff7d66",
    "#ff7eb6", "#8fd1a5", "#e8c06a",
    "rgba(242,69,43,0.4)", "rgba(11,7,7,0.8)", SH,
    "#8db4d6", "#ffa6c2", "#35211f",
  ]),
  orange: def("orange", "Orange", {}, [
    "#0b0805", "#130e08", "#1b140b", "#281d10",
    "#2a1f12", "#836a4b",
    "#f3ece4", "#b9b2a9", "#918a80",
    "#ff8a1a", "#1a0d00", "#ffa94d",
    "#ff6f8f", "#9ed3a2", "#f0cf63",
    "rgba(255,138,26,0.4)", "rgba(11,8,5,0.8)", SH,
    "#8db4d6", "#f0a0b8", "#392b1a",
  ]),
  ember: def("ember", "Ember", { glass: true }, [
    "#140a07", "#21110b", "#2c1710", "#3a1f15",
    "#3a2016", "#94654f",
    "#fff3ec", "#cbc0ba", "#a1928a",
    "#ff7a45", "#1c0700", "#ff9a6e",
    "#ff5f9a", "#b5e48c", "#ffc04d",
    "rgba(255,122,69,0.4)", "rgba(20,10,7,0.8)", SH,
    "#92bde0", "#ffa3c4", "#47281c",
  ]),
  emerald: def("emerald", "Emerald", {}, [
    "#04110c", "#0a1d15", "#0f281d", "#163628",
    "#143024", "#4f8670",
    "#eafff6", "#a8c7b9", "#7fa592",
    "#2ee59d", "#02130c", "#6ff0bb",
    "#ff8f8f", "#8af5c9", "#ffd166",
    "rgba(46,229,157,0.34)", "rgba(4,17,12,0.8)", SH,
    "#8fc0e0", "#f5a3b8", "#1f4434",
  ]),
  ocean: def("ocean", "Ocean", {}, [
    "#041218", "#08202a", "#0c2b37", "#123846",
    "#113340", "#4b8497",
    "#e9fbff", "#a2c3cc", "#779ba7",
    "#22d3ee", "#021116", "#67e3f6",
    "#fb7185", "#5eead4", "#fcd34d",
    "rgba(34,211,238,0.34)", "rgba(4,18,24,0.8)", SH,
    "#9fb9f2", "#f5a3b8", "#1c4350",
  ]),
  sapphire: def("sapphire", "Sapphire", {}, [
    "#070b1a", "#0d1430", "#131c3d", "#1b2650",
    "#18224a", "#5a6ea8",
    "#eef3ff", "#aab5d6", "#8190bd",
    "#4da3ff", "#04101f", "#8cc3ff",
    "#ff7a8a", "#5fd3a5", "#ffc66d",
    "rgba(77,163,255,0.38)", "rgba(7,11,26,0.8)", SH,
    "#9fc4ff", "#f5a3b8", "#27346a",
  ]),
  citrus: def("citrus", "Citrus", {}, [
    "#0e1206", "#171d0a", "#1f270e", "#2a3414",
    "#273112", "#72844a",
    "#f8ffe8", "#c3c8b3", "#979d84",
    "#c6f432", "#141a00", "#dcff6b",
    "#ff8a5b", "#7fd68f", "#ffd23f",
    "rgba(198,244,50,0.34)", "rgba(14,18,6,0.8)", SH,
    "#8fc0e0", "#f5a3b8", "#3a4720",
  ]),
  // Light theme: darker borders, real shadows, a dark accent.
  blue: def("blue", "Blue", { dark: false }, [
    "#f5f8fe", "#ffffff", "#eef3fc", "#ffffff",
    "#dbe5f6", "#6c88c0",
    "#0b2a6e", "#3b5b9c", "#657fb4",
    "#1d5fe0", "#ffffff", "#1d5fe0",
    "#b3261e", "#1b7a43", "#8a5a00",
    "rgba(29,95,224,0.22)", "rgba(245,248,254,0.88)", "0 1px 3px rgba(20,60,140,0.14), 0 14px 40px rgba(20,60,140,0.16)",
    "#1f56c4", "#b02a58", "#d3dff5",
  ]),
  nimbus: def("nimbus", "Nimbus", { scene: "clouds", glass: true }, [
    "#05060f", "#0b0c16", "#11131f", "#1a1c2a",
    "rgba(241,237,219,0.1)", "#76756c",
    "#f1eddb", "#aca897", "#86837a",
    "#f1eddb", "#05060f", "#f1eddb",
    "#d49c90", "#b9c7a5", "#dcc896",
    "rgba(241,237,219,0.26)", "rgba(5,6,15,0.82)", SH,
    "#9db6d0", "#d6a0a0", "#2b2d3c",
  ]),
  uzumaki: def("uzumaki", "Uzumaki", { scene: "uzumaki", glass: true }, [
    "#0b0b0a", "#121210", "#191916", "#23221e",
    "rgba(233,228,216,0.1)", "#74705f",
    "#ebe6da", "#aaa497", "#857f72",
    "#c9a66b", "#11100d", "#dcbb82",
    "#cf8a6d", "#a3b08f", "#c9a66b",
    "rgba(201,166,107,0.3)", "rgba(11,11,10,0.8)", "0 20px 60px rgba(0,0,0,0.6)",
    "#9aaec0", "#cc9490", "#302f29",
  ]),
};

export const THEME_LIST: ThemeDef[] = THEME_IDS.map((id) => THEMES[id]);

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}

// ── CSS generation (scripts/gen-theme-css.ts writes src/theme/tokens.css from this) ─────────────────

const VAR_NAMES: Record<keyof ThemeTokens, string> = {
  bg: "--bg",
  surface: "--surface",
  surface2: "--surface-2",
  surfaceRaised: "--surface-raised",
  border: "--border",
  borderStrong: "--border-strong",
  text: "--text",
  textMuted: "--text-muted",
  textFaint: "--text-faint",
  accent: "--accent",
  accentContrast: "--accent-contrast",
  focus: "--focus",
  danger: "--danger",
  success: "--success",
  warning: "--warning",
  selection: "--selection",
  scrim: "--scrim",
  shadow: "--shadow",
  sat: "--sat",
  sun: "--sun",
  flower: "--flower",
};

export function themeCss(): string {
  const blocks = THEME_LIST.map((t) => {
    const lines = (Object.keys(VAR_NAMES) as (keyof ThemeTokens)[]).map((k) => `  ${VAR_NAMES[k]}: ${t.tokens[k]};`);
    lines.push(`  --focus-width: ${t.focusWidth}px;`, `  color-scheme: ${t.dark ? "dark" : "light"};`);
    const sel = t.id === DEFAULT_THEME ? `:root,\nhtml[data-theme="${t.id}"]` : `html[data-theme="${t.id}"]`;
    return `${sel} {\n${lines.join("\n")}\n}`;
  });
  return `/* GENERATED by scripts/gen-theme-css.ts from src/theme/themes.ts. Do not edit by hand. */\n${blocks.join("\n")}\n`;
}

/** Contrast of a token pair within a theme (opaque tokens only). */
export function pair(t: ThemeDef, a: keyof ThemeTokens, b: keyof ThemeTokens): number {
  return contrastRatio(t.tokens[a], t.tokens[b]);
}
