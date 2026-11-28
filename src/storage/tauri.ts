import { invoke } from "@tauri-apps/api/core";
import { SafetyCopyError, type LoadResult, type StorageAdapter } from "./port";
import { recoverStored, retrySafetyCopies } from "./recovery";

/** The native store holds one document; safety copies live in the WebView
 *  storage alongside the other app settings. */
let readFailed = false;

/** Test seam: forget a remembered read failure. */
export function resetTauriReadState() {
  readFailed = false;
}

/** `undefined` is the sentinel for "invoke threw": it is not the same as
 *  `null`, which is a genuine first run with no file yet. */
async function readRaw(): Promise<string | null | undefined> {
  try {
    return await invoke<string | null>("read_store");
  } catch {
    return undefined;
  }
}

async function read(): Promise<LoadResult> {
  const raw = await readRaw();
  if (raw === undefined) {
    // Nothing was read, so nothing was backed up. The store on disk is still
    // the only copy: do not let any save replace it with defaults.
    readFailed = true;
    return { data: null, issue: null, blocked: true, readFailed: true };
  }
  readFailed = false;
  return recoverStored(raw, localStorage);
}

export const tauriAdapter: StorageAdapter = {
  async load() {
    return (await read()).data;
  },

  async loadWithReport() {
    return read();
  },

  async retryLoad() {
    return read();
  },

  async save(data) {
    if (readFailed) {
      // Retry the read on every save attempt. Even when it now works, the
      // caller's in-memory data may be defaults, so it must be reloaded by the
      // store rather than written over the real file.
      await read();
      throw new SafetyCopyError("read");
    }
    if (!retrySafetyCopies(localStorage)) throw new SafetyCopyError("backup");
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
