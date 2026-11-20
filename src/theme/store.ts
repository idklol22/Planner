import { useSyncExternalStore } from "react";
import { categoryColorFor } from "../domain/palette";
import { DEFAULT_THEME, THEMES, isThemeId, type ThemeId } from "./themes";

/** Theme preferences, stored per device. Keys match the inline script in index.html. */
const THEME_KEY = "planner.theme";
const glassKey = (id: ThemeId) => `planner.glass.${id}`;
const ANIM_KEY = "planner.anim";
/** Master switch: "1" lets themes use glass tiles and animated scenes. Off by default. */
const FX_KEY = "planner.fx";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice still applies for this session
  }
}

export function loadTheme(): ThemeId {
  const v = read(THEME_KEY);
  return isThemeId(v) ? v : DEFAULT_THEME;
}

export function glassFor(id: ThemeId): boolean {
  if (id === "contrast") return false;
  const v = read(glassKey(id));
  return v === null ? THEMES[id].glass : v === "1";
}

/** Low-end devices and data-savers start with the background animation off. */
function lowEnd(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.deviceMemory !== undefined && n.deviceMemory <= 2) || (n.hardwareConcurrency ?? 8) <= 2 || n.connection?.saveData === true;
}

export function animationOn(): boolean {
  const v = read(ANIM_KEY);
  return v === null ? !lowEnd() : v === "1";
}

export function fxOn(): boolean {
  return read(FX_KEY) === "1";
}

export interface ThemeState {
  theme: ThemeId;
  /** Glass & animated backgrounds allowed (master switch, default off). */
  fx: boolean;
  glass: boolean;
  animation: boolean;
}

let state: ThemeState = { theme: DEFAULT_THEME, fx: false, glass: false, animation: false };
const listeners = new Set<() => void>();

function snapshot(): ThemeState {
  const theme = loadTheme();
  return { theme, fx: fxOn(), glass: glassFor(theme), animation: animationOn() };
}

function applyToDom(s: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const def = THEMES[s.theme];
  root.dataset.theme = s.theme;
  root.dataset.fx = s.fx ? "1" : "0";
  root.dataset.scene = s.fx && def.scene && s.theme !== "contrast" ? "1" : "0";
  root.dataset.layout = s.fx && s.glass ? "tiles" : "flat";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", def.tokens.bg);
}

function commit(next: ThemeState) {
  state = next;
  applyToDom(state);
  listeners.forEach((l) => l());
}

export function initTheme() {
  commit(snapshot());
}

export function setTheme(id: ThemeId) {
  write(THEME_KEY, id);
  commit(snapshot());
}
export function setFx(on: boolean) {
  write(FX_KEY, on ? "1" : "0");
  commit(snapshot());
}
export function setGlass(on: boolean) {
  write(glassKey(state.theme), on ? "1" : "0");
  commit(snapshot());
}
export function setAnimation(on: boolean) {
  write(ANIM_KEY, on ? "1" : "0");
  commit(snapshot());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** The colour a stored category colour is drawn in under the current theme. Not reactive by itself: the shell
 *  components that render category colours subscribe with useThemeState() so they re-render on a theme change. */
export function catColor(color: string): string {
  return categoryColorFor(color, state.theme);
}

/** Same, as a hook. */
export function useCategoryColor(): (color: string) => string {
  const { theme } = useThemeState();
  return (color: string) => categoryColorFor(color, theme);
}

initTheme();
