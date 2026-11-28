import { invoke } from "@tauri-apps/api/core";
import type { StorageAdapter } from "./port";
import { recoverStored } from "./recovery";

/** The native store holds one document; safety copies live in the WebView
 *  storage alongside the other app settings. */
async function read() {
  const raw = await invoke<string | null>("read_store");
  return recoverStored(raw, localStorage);
}

export const tauriAdapter: StorageAdapter = {
  async load() {
    return (await read()).data;
  },

  async loadWithReport() {
    return read();
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
