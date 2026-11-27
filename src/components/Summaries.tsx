import { useMemo } from "react";
import { addDays, formatDayTitle, type ISODate } from "../domain/dates";
import { weekSummary, type CategoryCount } from "../domain/summaries";
import { catColor } from "../theme/store";
import { useStore } from "../state/store";

const fmt = (n: number) => n.toLocaleString("en-US");

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[15px] font-semibold leading-tight tabular-nums">{value}</div>
      <div className="truncate text-[12px] text-faint">{label}</div>
    </div>
  );
}

function Chips({ rows }: { rows: CategoryCount[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      {rows.map((r) => (
        <div key={r.category?.id ?? "none"} className="flex min-h-11 items-center gap-2.5 border-b border-line">
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: r.category ? catColor(r.category.color) : "var(--text-muted)" }}
          />
          <span className="min-w-0 flex-1 truncate text-[14px]">{r.category?.name ?? "Inbox"}</span>
          <span className="text-[12px] tabular-nums text-faint">
            {r.done}/{r.total}
          </span>
        </div>
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
    <section aria-label="Week summary" className="animate-rise">
      <h3 className="text-[14px] font-semibold">Week summary</h3>
      <div className="mb-3 text-[12px] text-faint">
        {formatDayTitle(start)} to {formatDayTitle(addDays(start, 6))}
      </div>
      <div className="flex gap-4">
        <Stat value={`${s.done}/${s.total}`} label="Tasks done" />
        <Stat value={s.daysLogged ? fmt(s.kcalAverage) : "-"} label="Avg kcal" />
        <Stat value={`${s.daysOnGoal}/${s.daysLogged}`} label="On goal" />
      </div>
      <Chips rows={s.perCategory} />
    </section>
  );
}
