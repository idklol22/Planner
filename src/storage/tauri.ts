import { invoke } from "@tauri-apps/api/core";
import { parseAppData } from "../domain/model";
import type { StorageAdapter } from "./port";

export const tauriAdapter: StorageAdapter = {
  async load() {
    const raw = await invoke<string | null>("read_store");
    if (!raw) return null;
    return parseAppData(JSON.parse(raw));
  },

  async save(data) {
    await invoke("write_store", { contents: JSON.stringify(data) });
  },

  async exportNote(fileName, contents, folder) {
    return invoke<string>("write_handoff_file", {
      folder: folder || null,
      fileName,
      contents,
    });
  },
};
