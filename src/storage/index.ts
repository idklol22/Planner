import { localAdapter } from "./local";
import { tauriAdapter } from "./tauri";
import type { StorageAdapter } from "./port";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const storage: StorageAdapter = isTauri ? tauriAdapter : localAdapter;
export type { StorageAdapter } from "./port";
