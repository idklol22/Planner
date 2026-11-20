import { parseAppData } from "../domain/model";
import type { StorageAdapter } from "./port";

export const DATA_KEY = "todomate.data";
export const HANDOFF_PREFIX = "todomate.handoff.";

/** Browser adapter so `npm run dev` works without the Rust toolchain.
 *  Handoff "files" are kept in localStorage under a virtual outbox path;
 *  the native adapter writes real files to disk. */
export const localAdapter: StorageAdapter = {
  async load() {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    try {
      return parseAppData(JSON.parse(raw));
    } catch {
      return null;
    }
  },

  async save(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  },

  async exportNote(fileName, contents) {
    localStorage.setItem(HANDOFF_PREFIX + fileName, contents);
    return `local-handoff/${fileName}`;
  },
};
