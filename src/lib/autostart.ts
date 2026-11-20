import { isTauri } from "../storage";

const UNSUPPORTED = "This desktop build does not support autostart";

/** Autostart is desktop-only: browser mode shows no toggle and loads no plugin. */
export function isAutostartAvailable(): boolean {
  return isTauri;
}

/** Read the real OS setting on each mount — never a duplicated AppData flag. */
export async function loadAutostart(): Promise<boolean> {
  if (!isAutostartAvailable()) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

/** Flip the OS login setting; toggling never restarts or closes the app. */
export async function setAutostart(on: boolean): Promise<void> {
  if (!isAutostartAvailable()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (on) await enable();
  else await disable();
}

/** Busy wins so the switch reads "Checking…" while state is in flight. */
export function autostartLabel(
  enabled: boolean,
  busy: boolean,
): "Checking…" | "On" | "Off" {
  if (busy) return "Checking…";
  return enabled ? "On" : "Off";
}

const PLUGIN_FAILURE = /plugin|module|not\s*found|cannot\s*find|dynamically imported/i;

/** Turn missing-plugin / missing-module errors into one actionable message. */
export function autostartError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if ((typeof window !== "undefined" && !isTauri) || PLUGIN_FAILURE.test(message)) {
    return UNSUPPORTED;
  }
  return message;
}
