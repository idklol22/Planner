import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  formatMonth,
  fromISODate,
  monthGrid,
  sameMonth,
  todayISO,
  weekDates,
  weekdayLabels,
  type ISODate,
} from "../domain/dates";
import { dayKcal, hasEntries, onGoal } from "../domain/calories";
import { daySummary } from "../domain/tasks";
import { useStore } from "../state/store";
import { Flower } from "./Flower";

export type CalendarMode = "week" | "month";

function weekendClass(iso: ISODate): string {
  const wd = fromISODate(iso).getDay();
  if (wd === 6) return "text-sat";
  if (wd === 0) return "text-sun";
  return "";
}

export function CalendarStrip({
  selected,
  onSelect,
  mode,
  onModeChange,
}: {
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
}) {
  const { data, ready, actions } = useStore();
  const today = todayISO();
  const direction = useRef<"next" | "prev">("next");

  const dates = useMemo(() => {
    if (mode === "week") return weekDates(selected);
    const grid = monthGrid(selected);
    // Drop a trailing week that is entirely next month.
    return sameMonth(grid[35], selected) ? grid : grid.slice(0, 35);
  }, [mode, selected]);

  const rangeKey = `${dates[0]}|${dates[dates.length - 1]}`;
  const ruleSig = data.tasks
    .filter((t) => t.rrule && !t.deletedAt)
    .map((t) => `${t.id}${t.rrule}${t.date}`)
    .join();
  useEffect(() => {
    if (ready) actions.materialize(dates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, ruleSig, ready]);

  const labels = weekdayLabels(1);

  function go(dir: 1 | -1) {
    direction.current = dir === 1 ? "next" : "prev";
    onSelect(mode === "week" ? addDays(selected, 7 * dir) : addMonths(selected, dir));
  }

  const touch = useRef<{ x: number; y: number } | null>(null);
  const sizes = mode === "week" ? { flower: 38, num: "h-7 w-7 text-[15px]" } : { flower: 32, num: "h-6 w-6 text-[13px]" };

  return (
    <section aria-label="Calendar" className="select-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[22px] font-bold tracking-tight">{formatMonth(selected)}</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go(-1)}
            aria-label={mode === "week" ? "Previous week" : "Previous month"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-ink active:scale-90"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => onModeChange(mode === "week" ? "month" : "week")}
            aria-label={mode === "week" ? "Switch to month view" : "Switch to week view"}
            title={mode === "week" ? "Show month" : "Show week"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-[14px] font-bold transition-all hover:bg-surface-3 active:scale-90"
          >
            <span key={mode} className="animate-fade">
              {mode === "week" ? "W" : "M"}
            </span>
          </button>
          <button
            onClick={() => go(1)}
            aria-label={mode === "week" ? "Next week" : "Next month"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-ink active:scale-90"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      <div
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mb-1 grid grid-cols-7 text-center">
          {labels.map((label, i) => (
            <div
              key={label + i}
              className={`text-[11px] font-semibold uppercase tracking-wide ${
                i === 5 ? "text-sat" : i === 6 ? "text-sun" : "text-faint"
              }`}
            >
              {label.slice(0, 3)}
            </div>
          ))}
        </div>

        <div
          key={rangeKey}
          className={`grid grid-cols-7 ${direction.current === "next" ? "slide-next" : "slide-prev"}`}
        >
          {dates.map((date) => {
            const summary = daySummary(data.tasks, data.categories, date);
            const isSel = date === selected;
            const isToday = date === today;
            const dim = mode === "month" && !sameMonth(date, selected);
            const logged = mode === "month" && hasEntries(data.calories, date);
            const goodDay = logged && onGoal(dayKcal(data.calories, date), data.settings.dailyCalorieGoal);
            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                aria-label={fromISODate(date).toDateString()}
                aria-pressed={isSel}
                className={`group flex flex-col items-center gap-1 rounded-2xl py-1.5 transition-opacity active:scale-95 ${
                  dim ? "opacity-35" : ""
                }`}
              >
                <Flower
                  size={sizes.flower}
                  filled={summary.allDone}
                  checked={summary.allDone}
                  color={summary.color ?? "#fff"}
                  count={summary.open}
                  className="transition-transform duration-200 group-hover:scale-110"
                />
                <span
                  className={`flex items-center justify-center rounded-full font-semibold tabular-nums transition-colors ${sizes.num} ${
                    isSel
                      ? "bg-white text-black"
                      : isToday
                        ? "bg-surface-3 text-ink"
                        : weekendClass(date) || "text-ink"
                  }`}
                >
                  {Number(date.slice(-2))}
                </span>
                {mode === "month" && (
                  <span
                    aria-hidden
                    className={`-mt-0.5 h-1 w-1 rounded-full transition-colors ${
                      logged ? (goodDay ? "bg-mint" : "bg-white/35") : "bg-transparent"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
