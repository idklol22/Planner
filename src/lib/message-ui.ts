/** Pure helpers shared by the LearnHarness chat page. No DOM or React here so
 *  the limits and grouping rules can be tested in a plain node environment. */

import type { MessageRow } from "./messages";

export const MAX_TEXT_LENGTH = 20_000;
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2048;

export interface SizeInfo {
  width: number;
  height: number;
  bytes: number;
}

/** Only live harness rows newer than the last time the chat was opened. */
export function unreadCount(rows: readonly MessageRow[], lastOpenAt: string | null): number {
  return rows.filter(
    (row) =>
      row.sender === "harness" &&
      row.deletedAt === null &&
      (lastOpenAt === null || row.createdAt > lastOpenAt),
  ).length;
}

/** Prefer MP4 on Apple devices, then WebM; null when neither can record. */
export function pickAudioMime(isSupported: (mime: string) => boolean): string | null {
  return ["audio/mp4", "audio/webm"].find(isSupported) ?? null;
}

export interface OutgoingAttachment {
  mime: string;
  bytes: number;
}

export interface OutgoingInput {
  text: string;
  attachments?: readonly OutgoingAttachment[];
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Enforce the hub's message contract before any upload or push happens. */
export function validateOutgoing(input: OutgoingInput): ValidationResult {
  const attachments = input.attachments ?? [];
  if (input.text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Message is too long (max ${MAX_TEXT_LENGTH} characters)` };
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `At most ${MAX_ATTACHMENTS} attachments per message` };
  }
  for (const attachment of attachments) {
    if (!attachment.mime.startsWith("image/") && !attachment.mime.startsWith("audio/")) {
      return { ok: false, error: "Attachments must be an image or audio file" };
    }
    if (attachment.bytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "Each attachment must be at most 15 MB" };
    }
  }
  if (input.text.trim().length === 0 && attachments.length === 0) {
    return { ok: false, error: "Write a message or attach a file" };
  }
  return { ok: true };
}

/** Oversized or very large images are re-encoded to JPEG on a canvas. */
export function needsDownscale({ width, height, bytes }: SizeInfo): boolean {
  return width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || bytes > MAX_ATTACHMENT_BYTES;
}

export interface DayGroup<T> {
  /** Local calendar day, used only as a stable grouping key. */
  key: string;
  label: string;
  rows: T[];
}

/** Group consecutive rows by local day, keeping the incoming row order. */
export function groupByDay<T extends { createdAt: string }>(
  rows: readonly T[],
  label: (date: Date) => string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  let currentKey: string | null = null;
  for (const row of rows) {
    const date = new Date(row.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (key !== currentKey) {
      currentKey = key;
      groups.push({ key, label: label(date), rows: [] });
    }
    groups[groups.length - 1].rows.push(row);
  }
  return groups;
}
