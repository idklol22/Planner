import type { AppData } from "../domain/model";

/** Why the last load could not use the stored value exactly as it was. */
export interface LoadIssue {
  /** The whole value could not be read, or only some records were salvaged. */
  reason: "unreadable" | "partial";
  /** Number of records left out of the app and quarantined. */
  dropped: number;
  /** Settings fields that fell back to their default value. */
  repairedSettings: string[];
  /** Storage keys where the untouched rejected values were saved. */
  quarantinedKeys: string[];
}

export interface LoadResult {
  data: AppData | null;
  issue: LoadIssue | null;
}

/** Persistence seam. The web adapter uses localStorage; the native adapter
 *  talks to small Rust commands that read/write files in the app-data dir. */
export interface StorageAdapter {
  load(): Promise<AppData | null>;
  /** Same load, with the recovery report the store needs for its toast. */
  loadWithReport?(): Promise<LoadResult>;
  save(data: AppData): Promise<void>;
  /** Write a finished note as Markdown to the handoff folder; return its path. */
  exportNote(fileName: string, contents: string, folder: string): Promise<string>;
}
