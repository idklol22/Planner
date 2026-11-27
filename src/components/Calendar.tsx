import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { dayTiles } from "../domain/calendar";
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
import { useStore } from "../state/store";
import { dayAriaLabel, dayMark } from "./calendarStatus";

export type CalendarMode = "week" | "month";

const WEEK_TILES = 5;
const MONTH_TILES = 4;
const labels = weekdayLabels(1);

/** A flat, text-first calendar: one number, one mark, no boxes and no coloured tiles. */
export function Calendar({
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
  const touch = useRef<{ x: number; y: number } | null>(null);
  const week = mode === "week";

  const dates = useMemo(() => {
    if (week) return weekDates(selected);
    const grid = monthGrid(selected);
    // Drop a trailing week that is entirely next month.
    return sameMonth(grid[35], selected) ? grid : grid.slice(0, 35);
  }, [week, selected]);

  const rangeKey = `${dates[0]}|${dates[dates.length - 1]}`;
  const ruleSig = data.tasks
    .filter((t) => t.rrule && !t.deletedAt && !t.archivedAt)
    .map((t) => `${t.id}${t.rrule}${t.date}`)
    .join();
  useEffect(() => {
    if (ready) actions.materialize(dates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, ruleSig, ready]);

  function go(step: 1 | -1) {
    direction.current = step === 1 ? "next" : "prev";
    onSelect(week ? addDays(selected, 7 * step) : addMonths(selected, step));
  }

  const arrow = "flex h-11 w-11 items-center justify-center text-muted hover:text-ink";

  return (
    <section aria-label="Calendar" className="select-none !px-1.5 !pb-0 !pt-1.5">
      {!week && (
        <div className="flex items-center justify-between pb-1 pl-2">
          <h2 className="text-[14px] font-semibold">{formatMonth(selected)}</h2>
          <div className="flex">
            <button onClick={() => go(-1)} aria-label="Previous month" className={arrow}>
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => go(1)} aria-label="Next month" className={arrow}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

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
          else if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.5) onModeChange(dy > 0 ? "month" : "week");
        }}
        className="touch-pan-y"
      >
        {!week && (
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] pb-0.5 text-center">
            {labels.map((label, i) => (
              <div key={label + i} className="text-[11px] font-medium text-faint">
                {label.slice(0, 1)}
              </div>
            ))}
          </div>
        )}

        <div
          key={rangeKey}
          className={`grid grid-cols-[repeat(7,minmax(0,1fr))] gap-x-0.5 gap-y-0.5 ${
            direction.current === "next" ? "slide-next" : "slide-prev"
          }`}
        >
          {dates.map((date, index) => {
            const info = dayTiles(data.tasks, data.categories, date, week ? WEEK_TILES : MONTH_TILES);
            const mark = dayMark(info.total, info.done);
            const isSelected = date === selected;
            const isToday = date === today;
            const outside = !week && !sameMonth(date, selected);
            const name = fromISODate(date).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                aria-label={dayAriaLabel(name, info.total, info.done)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center ${
                  week ? "pb-0.5 pt-0.5" : ""
                } ${outside ? "opacity-30" : ""}`}
              >
                {week && (
                  <span className="text-[11px] font-medium uppercase leading-none text-faint">
                    {labels[index].slice(0, 1)}
                  </span>
                )}
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full tabular-nums ${
                    week ? "text-[15px]" : "text-[14px]"
                  } ${
                    isSelected
                      ? "bg-ink font-semibold text-canvas"
                      : isToday
                        ? "font-semibold text-accent"
                        : "text-ink"
                  }`}
                >
                  {Number(date.slice(-2))}
                </span>
                <span
                  aria-hidden
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    mark === "open"
                      ? "bg-muted"
                      : mark === "done"
                        ? "border border-faint"
                        : "invisible"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onModeChange(week ? "month" : "week")}
        aria-label={week ? "Switch to month view" : "Switch to week view"}
        className="flex min-h-11 w-full items-center justify-center text-faint hover:text-ink"
      >
        {week ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
    </section>
  );
}
