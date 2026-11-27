/** Typed access to the iOS-only `PlannerNative` Capacitor plugin.
 *  Every call is skipped (or rejected with a readable message) off iOS. */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { HealthRow } from "../storage/hub";

/** One day as returned by the native Health reader (no row metadata). */
export type NativeHealthDay = Omit<HealthRow, "id" | "updatedAt" | "deletedAt" | "source">;

interface PlannerNativePlugin {
  reloadWidgets(): Promise<void>;
  readHealth(options: { days: number }): Promise<{ days: NativeHealthDay[] }>;
}

const PlannerNative = registerPlugin<PlannerNativePlugin>("PlannerNative");

export function isIOS(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/** Best effort: reloading a widget on any other platform is a no-op. */
export async function reloadWidgets(): Promise<void> {
  if (!isIOS()) return;
  await PlannerNative.reloadWidgets();
}

/** Ask the native side for up to `days` days of Health data. Rejects clearly
 *  when Health is unavailable or the app is not running on iPhone. */
export async function readHealth(options: { days: number }): Promise<{ days: NativeHealthDay[] }> {
  if (!isIOS()) throw new Error("Apple Health is only available on iPhone");
  try {
    const result = await PlannerNative.readHealth(options);
    if (!result || !Array.isArray(result.days)) {
      throw new Error("Health returned no data");
    }
    return { days: result.days };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Could not read Apple Health: ${String(error)}`);
  }
}
