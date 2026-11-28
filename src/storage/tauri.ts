import { invoke } from "@tauri-apps/api/core";
import { SafetyCopyError, type LoadResult, type StorageAdapter } from "./port";
import { recoverStored, retrySafetyCopies } from "./recovery";

/** The native store holds one document; safety copies live in the WebView
 *  storage alongside the other app settings. */
/** Set only when `read_store` throws. Only a reload that the store adopts may
 *  clear it: a diagnostic read from `save()` must never open the gate, or a
 *  later flush could write in-memory defaults over the recovered original. */
let reloadRequired = false;

/** Test seam: forget a remembered read failure. */
export function resetTauriReadState() {
  reloadRequired = false;
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
    reloadRequired = true;
    return { data: null, issue: null, blocked: true, readFailed: true };
  }
  // Only a reload the store adopts clears the latch. A diagnostic read from
  // save() must not, or a later flush could write stale in-memory data over
  // the file that just became readable.
  return recoverStored(raw, localStorage);
}

async function reload(): Promise<LoadResult> {
  const result = await read();
  if (!result.readFailed) reloadRequired = false;
  return result;
}

export const tauriAdapter: StorageAdapter = {
  async load() {
    return (await reload()).data;
  },

  async loadWithReport() {
    return reload();
  },

  async retryLoad() {
    return reload();
  },

  async save(data) {
    if (reloadRequired) throw new SafetyCopyError("read");
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
