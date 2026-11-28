import { useMemo } from "react";
import { addDays, type ISODate } from "../domain/dates";
import { nearestCategoryColor } from "../domain/palette";
import { MOTION_MS, usePresence } from "../lib/motion";
import { useStore } from "../state/store";
import { useSync } from "../state/sync";
import { deadlinesForCategory } from "../sync/mirror-view";
import type { HDeadlineRow } from "../storage/hub";

const WINDOW_DAYS = 14;

type Group = { key: string; label: string; color: string | null; rows: HDeadlineRow[] };

/** Read-only LearnHarness deadlines, grouped under the category linked to their subject. */
export function DeadlinesCard({ date }: { date: ISODate }) {
  const { data } = useStore();
  const { mirror, configured } = useSync();

  const groups = useMemo<Group[]>(() => {
    if (!configured || mirror.deadlines.length === 0) return [];
    const last = addDays(date, WINDOW_DAYS);
    const inWindow = (d: HDeadlineRow) =>
      !d.done && d.due.slice(0, 10) >= date && d.due.slice(0, 10) <= last;

    const result: Group[] = [];
    const used = new Set<string>();
    for (const cat of data.categories.filter((c) => !c.archived && !c.deletedAt && c.linkedSubjectId)) {
      const rows = deadlinesForCategory(mirror, cat.linkedSubjectId, cat.linkedTopicId).filter(
        (d) => inWindow(d) && !used.has(d.id),
      );
      rows.forEach((d) => used.add(d.id));
      if (rows.length) result.push({ key: cat.id, label: cat.name, color: cat.color, rows });
    }
    const rest = mirror.deadlines
      .filter((d) => inWindow(d) && !used.has(d.id))
      .sort((a, b) => a.due.localeCompare(b.due));
    if (rest.length) result.push({ key: "__other", label: "Other deadlines", color: null, rows: rest });
    return result;
  }, [date, configured, mirror, data.categories]);

  // The block rises in when deadlines appear and settles away when they leave.
  // The closing animation uses --motion-fast; hold the block for exactly that.
  const presence = usePresence(groups.length > 0, MOTION_MS.fast);
  if (!presence.mounted) return null;

  const subjectName = (id: string) => mirror.subjects.find((s) => s.id === id)?.name ?? "";

  return (
    <section aria-label="Deadlines" className={`cal-block mt-4 ${presence.closing ? "is-closing" : ""}`}>
      <h2 className="px-1 text-[14px] font-semibold">Deadlines</h2>
      <div className="mt-2">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 px-1 py-1 text-[12px] text-faint">
              {group.color && (
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ backgroundColor: nearestCategoryColor(group.color) }}
                />
              )}
              {group.label}
            </div>
            {group.rows.map((d) => (
              <div key={d.id} className="flex min-h-11 items-center gap-3 border-b border-line px-1 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <span className="text-[12px] text-muted">
                  {[subjectName(d.subjectId), d.due.slice(5, 10)].filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
