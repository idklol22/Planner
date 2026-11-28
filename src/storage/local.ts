import type { StorageAdapter } from "./port";
import { recoverStored } from "./recovery";

export const DATA_KEY = "todomate.data";
export const HANDOFF_PREFIX = "todomate.handoff.";

function read(): ReturnType<typeof recoverStored> {
  return recoverStored(localStorage.getItem(DATA_KEY), localStorage);
}

/** Browser adapter so `npm run dev` works without the Rust toolchain.
 *  Handoff "files" are kept in localStorage under a virtual outbox path;
 *  the native adapter writes real files to disk. */
export const localAdapter: StorageAdapter = {
  async load() {
    return read().data;
  },

  async loadWithReport() {
    return read();
  },

  async save(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  },

  async exportNote(fileName, contents) {
    localStorage.setItem(HANDOFF_PREFIX + fileName, contents);
    return `local-handoff/${fileName}`;
  },
};
