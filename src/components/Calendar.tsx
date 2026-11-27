import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { dayTiles, type DayTile } from "../domain/calendar";
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
import { catColor } from "../theme/store";

export type CalendarMode = "week" | "month";

const WEEK_TILES = 5;
const MONTH_TILES = 4;
const labels = weekdayLabels(1);

function Tile({ tile, className }: { tile: DayTile; className: string }) {
  const color = tile.color ? catColor(tile.color) : "var(--accent)";
  return <span className={`cal-tile ${tile.done ? "done" : ""} ${className}`} style={{ color }} />;
}

/**
 * The calendar draws every task as a tile in its category colour: filled when done, outlined when open.
 * A week reads as columns that fill up; a month as a row of small tiles under each date.
 */
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

  const arrow = "flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink/10 active:scale-90";

  return (
    <section aria-label="Calendar" className="module select-none !px-1.5 !pb-0 !pt-1.5">
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
              <div key={label + i} className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                {label.slice(0, 2)}
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
            const isSelected = date === selected;
            const isToday = date === today;
            const outside = !week && !sameMonth(date, selected);
            const name = fromISODate(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                aria-label={info.total ? `${name}, ${info.done} of ${info.total} done` : name}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`cal-day flex flex-col items-center rounded-[10px] active:scale-95 ${
                  week ? "pb-1.5 pt-1" : "h-11 pt-1"
                } ${outside ? "opacity-30" : ""}`}
              >
                {week && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? "text-accent" : "text-faint"}`}>
                    {labels[index].slice(0, 3)}
                  </span>
                )}
                <span
                  className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-md px-1 tabular-nums ${
                    week ? "text-[16px]" : "text-[13px]"
                  } ${isToday ? "bg-[var(--accent)] font-bold text-[var(--accent-contrast)]" : "font-semibold text-ink"}`}
                >
                  {Number(date.slice(-2))}
                </span>

                {week ? (
                  // Built from the bottom up, so a day visibly fills as tasks are finished.
                  <span aria-hidden className="mt-1 flex h-[34px] w-full flex-col-reverse items-center gap-[2px]">
                    {info.total === 0 && <span className="h-[2px] w-2.5 rounded-full bg-ink/15" />}
                    {info.tiles.map((tile) => (
                      <Tile key={tile.id} tile={tile} className="h-[5px] w-[22px]" />
                    ))}
                    {info.more > 0 && (
                      <span className="text-[9px] font-bold leading-[7px] text-muted">+{info.more}</span>
                    )}
                  </span>
                ) : (
                  !outside && (
                    <span aria-hidden className="mt-[3px] flex h-[6px] items-center justify-center gap-[2px]">
                      {info.tiles.map((tile) => (
                        <Tile key={tile.id} tile={tile} className="h-[6px] w-[6px]" />
                      ))}
                      {info.more > 0 && <span className="text-[8px] font-bold leading-none text-muted">+{info.more}</span>}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onModeChange(week ? "month" : "week")}
        aria-label={week ? "Switch to month view" : "Switch to week view"}
        className="flex h-6 w-full items-center justify-center text-faint hover:text-ink"
      >
        {week ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
    </section>
  );
}
