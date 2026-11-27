/** Pure status text and link detection for the read-only LearnHarness link shown in Settings. */

import type { HSubjectRow } from "../storage/hub";

export interface HarnessLinkState {
  exists: boolean;
  newestUpdatedAt: string | null;
}

function newerTimestamp(candidate: string, current: string | null): boolean {
  if (current === null) return true;
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  if (Number.isNaN(a) || Number.isNaN(b)) return candidate > current;
  return a > b;
}

/** Live mirrored subjects only; newestUpdatedAt is null when none is live. */
export function harnessLink(
  subjects: readonly HSubjectRow[],
): { exists: boolean; newestUpdatedAt: string | null } {
  let newestUpdatedAt: string | null = null;
  let exists = false;
  for (const subject of subjects) {
    if (subject.deletedAt != null) continue;
    exists = true;
    if (newerTimestamp(subject.updatedAt, newestUpdatedAt)) {
      newestUpdatedAt = subject.updatedAt;
    }
  }
  return { exists, newestUpdatedAt };
}

export function harnessStatus(configured: boolean, link: HarnessLinkState): string {
  if (!configured) return "Set up cloud sync first";
  if (!link.exists || !link.newestUpdatedAt) return "Not linked yet";
  return `Linked, last synced ${new Date(link.newestUpdatedAt).toLocaleString()}`;
}
