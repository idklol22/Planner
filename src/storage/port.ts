import type { AppData } from "../domain/model";

/** Persistence seam. The web adapter uses localStorage; the native adapter
 *  talks to small Rust commands that read/write files in the app-data dir. */
export interface StorageAdapter {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  /** Write a finished note as Markdown to the handoff folder; return its path. */
  exportNote(fileName: string, contents: string, folder: string): Promise<string>;
}
