import { CalendarClock } from "lucide-react";
import { addDays, type ISODate } from "../domain/dates";
import { nearestCategoryColor } from "../domain/palette";
import { useStore } from "../state/store";
import { useSync } from "../state/sync";
import { deadlinesForCategory } from "../sync/mirror-view";
import type { HDeadlineRow } from "../storage/hub";

const WINDOW_DAYS = 14;

/** Read-only LearnHarness deadlines, grouped under the category linked to their subject. */
export function DeadlinesCard({ date }: { date: ISODate }) {
  const { data } = useStore();
  const { mirror, configured } = useSync();
  if (!configured || mirror.deadlines.length === 0) return null;

  const last = addDays(date, WINDOW_DAYS);
  const inWindow = (d: HDeadlineRow) => !d.done && d.due.slice(0, 10) >= date && d.due.slice(0, 10) <= last;
  const subjectName = (id: string) => mirror.subjects.find((s) => s.id === id)?.name ?? "";

  const groups: Array<{ key: string; label: string; color: string | null; rows: HDeadlineRow[] }> = [];
  const used = new Set<string>();
  for (const cat of data.categories.filter((c) => !c.archived && c.linkedSubjectId)) {
    const rows = deadlinesForCategory(mirror, cat.linkedSubjectId, cat.linkedTopicId).filter(
      (d) => inWindow(d) && !used.has(d.id),
    );
    rows.forEach((d) => used.add(d.id));
    if (rows.length) groups.push({ key: cat.id, label: cat.name, color: cat.color, rows });
  }
  const rest = mirror.deadlines
    .filter((d) => inWindow(d) && !used.has(d.id))
    .sort((a, b) => a.due.localeCompare(b.due));
  if (rest.length) groups.push({ key: "__other", label: "Other deadlines", color: null, rows: rest });
  if (groups.length === 0) return null;

  return (
    <section aria-label="Deadlines" className="module mt-4">
      <div className="module-head">
        <h2 className="module-title flex items-center gap-2">
          <CalendarClock size={16} /> Deadlines
        </h2>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">
              {group.color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: nearestCategoryColor(group.color) }}
                />
              )}
              {group.label}
            </div>
            {group.rows.map((d) => (
              <div key={d.id} className="flex min-h-[44px] items-center gap-3 px-1 text-[15px]">
                <span className="flex-1 truncate">{d.title}</span>
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
