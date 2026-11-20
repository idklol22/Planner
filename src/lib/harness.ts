import { DEFAULT_HARNESS_URL } from "../domain/model";

export { DEFAULT_HARNESS_URL };

/** LearnHarness rejects slow Planner requests rather than hanging the UI. */
export const HARNESS_TIMEOUT_MS = 5_000;

export interface HarnessTopic {
  id: string;
  name: string;
}

export interface HarnessSubject {
  id: string;
  name: string;
  color: string;
  topics: HarnessTopic[];
}

export interface HarnessSubjectsResponse {
  subjects: HarnessSubject[];
}

/** POST /api/planner/notes body — the note is upserted by `externalId`. */
export interface HarnessNote {
  externalId: string;
  subjectId: string;
  topicId?: string;
  title: string;
  date: string;
  markdown: string;
  finished: boolean;
}

export interface HarnessNoteResponse {
  externalId?: string;
  fileName?: string;
  [key: string]: unknown;
}

export type HarnessResult<T> = { ok: true; data: T } | { ok: false; error: string };

function baseUrl(value: string | undefined | null): string {
  return ((value ?? "").trim() || DEFAULT_HARNESS_URL).replace(/\/+$/, "");
}

/** Small typed client for the Planner endpoints of a running LearnHarness dev server. */
export class HarnessClient {
  readonly baseUrl: string;

  constructor(value: string = DEFAULT_HARNESS_URL) {
    this.baseUrl = baseUrl(value);
  }

  subjects(): Promise<HarnessResult<HarnessSubjectsResponse>> {
    return this.request<HarnessSubjectsResponse>("/api/planner/subjects", { method: "GET" });
  }

  sendNote(note: HarnessNote): Promise<HarnessResult<HarnessNoteResponse>> {
    return this.request<HarnessNoteResponse>("/api/planner/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<HarnessResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HARNESS_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      if (!response.ok) {
        return { ok: false, error: `LearnHarness responded ${response.status}` };
      }
      const text = await response.text();
      const data = (text ? JSON.parse(text) : {}) as T;
      return { ok: true, data };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, error: "LearnHarness request timed out" };
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}
