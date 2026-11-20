import { useMemo } from "react";
import { addDays, formatDayTitle, type ISODate } from "../domain/dates";
import { daySummary, weekSummary, type CategoryCount } from "../domain/summaries";
import { useStore } from "../state/store";

const fmt = (n: number) => n.toLocaleString("en-US");

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-black px-3 py-2.5">
      <div className="truncate text-[20px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="truncate text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
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
          className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-[13px] font-semibold"
          style={{ color: r.category?.color ?? "#ffffff" }}
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

export function DaySummaryCard({ date }: { date: ISODate }) {
  const { data } = useStore();
  const goal = data.settings.dailyCalorieGoal;
  const s = useMemo(
    () => daySummary(date, data.tasks, data.categories, data.calories, goal),
    [date, data.tasks, data.categories, data.calories, goal],
  );
  return (
    <section aria-label="Day summary" className="animate-rise rounded-3xl bg-surface-2 p-4">
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-faint">Day summary</h3>
      <div className="flex gap-2">
        <Stat value={`${s.done}/${s.total}`} label="Tasks done" />
        <Stat value={fmt(s.kcal)} label={`kcal of ${fmt(s.goal)}`} />
      </div>
      {s.worked.length > 0 ? (
        <>
          <div className="mt-3 text-[12px] font-medium text-muted">Worked on</div>
          <Chips rows={s.worked} />
        </>
      ) : (
        <p className="mt-3 text-[13px] text-faint">No tasks completed on this day.</p>
      )}
    </section>
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
    <section aria-label="Week summary" className="animate-rise rounded-3xl bg-surface-2 p-4">
      <h3 className="mb-0.5 text-[13px] font-semibold uppercase tracking-wider text-faint">Week summary</h3>
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
