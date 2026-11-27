import { useMemo } from "react";
import { addDays, formatDayTitle, type ISODate } from "../domain/dates";
import { weekSummary, type CategoryCount } from "../domain/summaries";
import { catColor } from "../theme/store";
import { useStore } from "../state/store";

const fmt = (n: number) => n.toLocaleString("en-US");

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-canvas/40 px-3.5 py-3">
      <div className="truncate text-[17px] font-semibold leading-tight tabular-nums">{value}</div>
      <div className="truncate text-[11.5px] font-medium uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

function Chips({ rows }: { rows: CategoryCount[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={r.category?.id ?? "none"}
          className="flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3.5 py-1.5 text-[13px] font-semibold"
          style={{ color: r.category ? catColor(r.category.color) : "var(--text)" }}
        >
          {r.category?.name ?? "Inbox"}
          <span className="font-medium tabular-nums text-faint">
            {r.done}/{r.total}
          </span>
        </span>
      ))}
    </div>
  );
}

export function WeekSummaryCard({ start }: { start: ISODate }) {
  const { data } = useStore();
  const goal = data.settings.dailyCalorieGoal;
  const s = useMemo(
    () => weekSummary(start, data.tasks, data.categories, data.calories, goal),
    [start, data.tasks, data.categories, data.calories, goal],
  );
  return (
    <section aria-label="Week summary" className="module animate-rise">
      <h3 className="module-title mb-0.5">Week summary</h3>
      <div className="mb-3 text-[12px] text-faint">
        {formatDayTitle(start)} to {formatDayTitle(addDays(start, 6))}
      </div>
      <div className="flex gap-2">
        <Stat value={`${s.done}/${s.total}`} label="Tasks done" />
        <Stat value={s.daysLogged ? fmt(s.kcalAverage) : "-"} label="Avg kcal" />
        <Stat value={`${s.daysOnGoal}/${s.daysLogged}`} label="On goal" />
      </div>
      <Chips rows={s.perCategory} />
    </section>
  );
}
