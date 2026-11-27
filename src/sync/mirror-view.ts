/** Read-only views over the Harness mirror, shaped for the UI. */

import type { HarnessSubject } from "../lib/harness-types";
import type { HDeadlineRow, HMaterialRow } from "../storage/hub";
import type { Mirror } from "./mapping";

const byOrderThenName = (a: { order: number; name: string }, b: { order: number; name: string }) =>
  a.order - b.order || a.name.localeCompare(b.name);

/** Subjects with their topics, in the shape the category picker already uses. */
export function mirrorSubjects(mirror: Mirror): HarnessSubject[] {
  return [...mirror.subjects].sort(byOrderThenName).map((subject) => ({
    id: subject.id,
    name: subject.name,
    color: subject.color,
    topics: mirror.topics
      .filter((topic) => topic.subjectId === subject.id)
      .sort(byOrderThenName)
      .map((topic) => ({ id: topic.id, name: topic.name })),
  }));
}

/** Library order: lecture number (numeric aware), then date, then title. */
export function sortMaterials(materials: readonly HMaterialRow[]): HMaterialRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...materials].sort((a, b) => {
    if (a.lecture && b.lecture) {
      const byLecture = collator.compare(a.lecture, b.lecture);
      if (byLecture) return byLecture;
    } else if (a.lecture || b.lecture) {
      return a.lecture ? -1 : 1;
    }
    const byDate = (a.date ?? a.addedAt).localeCompare(b.date ?? b.addedAt);
    return byDate || collator.compare(a.title, b.title);
  });
}

/** Open deadlines for the Day page, grouped by the category linked to their subject. */
export function deadlinesForCategory(
  mirror: Mirror,
  linkedSubjectId: string | null,
  linkedTopicId?: string | null,
): HDeadlineRow[] {
  if (!linkedSubjectId) return [];
  return mirror.deadlines
    .filter(
      (d) =>
        d.subjectId === linkedSubjectId &&
        (!linkedTopicId || !d.topicId || d.topicId === linkedTopicId),
    )
    .sort((a, b) => a.due.localeCompare(b.due));
}
