import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
import { MOTION_MS, prefersReducedMotion } from "../lib/motion";
import { useStore } from "../state/store";
import { dayAriaLabel, dayMark } from "./calendarStatus";
import { pageDirection, resolvePageGesture } from "./calendarMotion";

export type CalendarMode = "week" | "month";

const WEEK_TILES = 5;
const MONTH_TILES = 4;
const labels = weekdayLabels(1);

type CircleBox = { x: number; y: number; w: number; h: number; animate: boolean };
type Drag = { dx: number; phase: "idle" | "drag" | "settle" };

/** One flat grid of dates. The selected circle is a separate, measured layer so
 *  it can travel between cells; the marks cross-fade when a day changes state. */
function CalendarGrid({
  dates,
  mode,
  selected,
  onSelect,
  animate,
  interactive,
}: {
  dates: ISODate[];
  mode: CalendarMode;
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  animate: boolean;
  interactive: boolean;
}) {
  const week = mode === "week";
  const gridRef = useRef<HTMLDivElement>(null);
  const numRefs = useRef(new Map<string, HTMLSpanElement>());
  const [circle, setCircle] = useState<CircleBox | null>(null);
  const placed = useRef(false);

  const measure = useCallback(
    (instant: boolean) => {
      const grid = gridRef.current;
      const number = numRefs.current.get(selected);
      if (!grid || !number) {
        setCircle(null);
        return;
      }
      const g = grid.getBoundingClientRect();
      const n = number.getBoundingClientRect();
      setCircle({ x: n.left - g.left, y: n.top - g.top, w: n.width, h: n.height, animate: !instant });
    },
    [selected],
  );

  useLayoutEffect(() => {
    // A freshly mounted page must not fly in from the previous origin.
    measure(!placed.current || !animate);
    placed.current = true;
  }, [measure, animate]);

  useEffect(() => {
    const onResize = () => measure(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  const { data } = useStore();
  const today = todayISO();

  return (
    <div ref={gridRef} className="cal-grid grid grid-cols-[repeat(7,minmax(0,1fr))] gap-x-0.5 gap-y-0.5">
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
            type="button"
            onClick={() => interactive && onSelect(date)}
            aria-label={dayAriaLabel(name, info.total, info.done)}
            aria-pressed={isSelected}
            aria-current={isToday ? "date" : undefined}
            className={`cal-cell cal-press flex min-h-11 flex-col items-center justify-center ${
              week ? "pb-0.5 pt-0.5" : ""
            } ${outside ? "opacity-30" : ""}`}
          >
            {week && (
              <span className="text-[11px] font-medium uppercase leading-none text-faint">
                {labels[index].slice(0, 1)}
              </span>
            )}
            <span
              ref={(el) => {
                if (el) numRefs.current.set(date, el);
                else numRefs.current.delete(date);
              }}
              data-selected={isSelected}
              className={`cal-num flex h-7 w-7 items-center justify-center rounded-full tabular-nums ${
                week ? "text-[15px]" : "text-[14px]"
              } ${
                isSelected
                  ? "font-semibold text-canvas"
                  : isToday
                    ? "font-semibold text-accent"
                    : "text-ink"
              }`}
            >
              {Number(date.slice(-2))}
            </span>
            <span aria-hidden className="cal-dots mt-0.5 h-1 w-1">
              <span className={`cal-dot cal-dot--open ${mark === "open" ? "is-on" : ""}`} />
              <span className={`cal-dot cal-dot--done ${mark === "done" ? "is-on" : ""}`} />
            </span>
          </button>
        );
      })}
      {circle && (
        <span
          aria-hidden
          className="cal-select"
          data-week={week}
          data-animate={circle.animate}
          style={{
            transform: `translate3d(${circle.x}px, ${circle.y}px, 0)`,
            width: circle.w,
            height: circle.h,
          }}
        >
          {Number(selected.slice(-2))}
        </span>
      )}
    </div>
  );
}

/** A page of dates: follows the finger horizontally, then slides or springs
 *  back. Vertical gestures are handed straight back to the page scroll. */
function CalendarPage({
  mode,
  dates,
  selected,
  onSelect,
  onPaging,
  onModeChange,
  active,
  header,
}: {
  mode: CalendarMode;
  dates: ISODate[];
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  onPaging: (step: 1 | -1) => void;
  onModeChange: (mode: CalendarMode) => void;
  active: boolean;
  header?: ReactNode;
}) {
  const [outgoing, setOutgoing] = useState<{ dates: ISODate[]; selected: ISODate; step: 1 | -1 } | null>(
    null,
  );
  const [drag, setDrag] = useState<Drag>({ dx: 0, phase: "idle" });
  const gesture = useRef<{ id: number; x: number; y: number; axis: "x" | "y" | null; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const prev = useRef({ dates, selected });
  const settleTimer = useRef(0);
  const exitTimer = useRef(0);

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = { dates, selected };
    if (before.dates === dates) return;
    const step = pageDirection(before.dates, dates);
    if (step === 0) return; // a tap inside the same page
    // A later selection inside the new page must not cancel this visual exit.
    window.clearTimeout(exitTimer.current);
    setOutgoing({ dates: before.dates, selected: before.selected, step });
    exitTimer.current = window.setTimeout(
      () => setOutgoing(null),
      prefersReducedMotion() ? 0 : MOTION_MS.slow,
    );
  }, [dates, selected]);

  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
      window.clearTimeout(exitTimer.current);
    },
    [],
  );

  function settle() {
    setDrag({ dx: 0, phase: "settle" });
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(
      () => setDrag((d) => (d.phase === "settle" ? { dx: 0, phase: "idle" } : d)),
      prefersReducedMotion() ? 0 : MOTION_MS.base,
    );
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!active || e.pointerType === "mouse") return;
    // A drag whose click never arrived must not swallow the next real tap.
    suppressClick.current = false;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, moved: false };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const state = resolvePageGesture({
      pointerType: e.pointerType,
      startX: g.x,
      startY: g.y,
      x: e.clientX,
      y: e.clientY,
      axis: g.axis,
      pointerDown: true,
    });
    if (state.axis === "y") {
      // Vertical scroll wins: let go and let the browser handle it.
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      gesture.current = null;
      setDrag({ dx: 0, phase: "idle" });
      return;
    }
    if (state.axis === "x") {
      g.axis = "x";
      g.moved = true;
      suppressClick.current = true;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      setDrag({ dx: state.dx, phase: "drag" });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const state = resolvePageGesture({
      pointerType: e.pointerType,
      startX: g.x,
      startY: g.y,
      x: e.clientX,
      y: e.clientY,
      axis: g.axis,
      pointerDown: false,
    });
    if (g.moved && state.step !== 0) {
      // The selection changes now; the sliding layers are purely visual.
      setDrag({ dx: 0, phase: "idle" });
      onPaging(state.step);
    } else if (g.moved) {
      settle();
    } else {
      setDrag({ dx: 0, phase: "idle" });
    }
  }

  function onPointerCancel() {
    gesture.current = null;
    suppressClick.current = false;
    settle();
  }

  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  // The existing vertical swipe still toggles the view; touch-action: pan-y
  // means the browser keeps scrolling at the same time.
  function onTouchEnd(e: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !active) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      onModeChange(dy > 0 ? "month" : "week");
    }
  }

  const rangeKey = `${dates[0]}|${dates[dates.length - 1]}`;
  const direction = outgoing?.step === 1 ? "next" : "prev";
  const dragStyle = drag.phase === "idle" ? undefined : { transform: `translate3d(${drag.dx}px, 0, 0)` };

  return (
    <div className="cal-page" data-active={active} aria-hidden={!active} inert={!active}>
      <div
        className="cal-page-inner touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }
        }}
        onTouchEnd={onTouchEnd}
      >
        {header}
        <div className="cal-grid-stage">
          {outgoing && (
            <div
              key={`out-${outgoing.dates[0]}`}
              className={`cal-layer cal-layer--out cal-exit-${direction}`}
              aria-hidden
              inert
            >
              <CalendarGrid
                dates={outgoing.dates}
                mode={mode}
                selected={outgoing.selected}
                onSelect={onSelect}
                animate={false}
                interactive={false}
              />
            </div>
          )}
          <div
            key={`in-${rangeKey}`}
            className={`cal-layer cal-layer--in ${drag.phase !== "idle" ? `cal-drag-${drag.phase}` : ""}`}
            style={dragStyle}
          >
            {/* The slide lives one level in so a drag can transform the layer
                at the same time without the animation overriding the finger. */}
            <div className={outgoing ? `cal-slide cal-enter-${direction}` : undefined}>
              <CalendarGrid
                dates={dates}
                mode={mode}
                selected={selected}
                onSelect={onSelect}
                animate={!outgoing}
                interactive={active}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Flat, text-first calendar: one number, one mark, no boxes or coloured tiles. */
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
  const week = mode === "week";

  const weekDatesList = useMemo(() => weekDates(selected), [selected]);
  const monthDatesList = useMemo(() => {
    const grid = monthGrid(selected);
    // Drop a trailing week that is entirely next month.
    return sameMonth(grid[35], selected) ? grid : grid.slice(0, 35);
  }, [selected]);

  // A week is always inside its month grid, so one materialise range covers both pages.
  const rangeKey = `${monthDatesList[0]}|${monthDatesList[monthDatesList.length - 1]}`;
  const ruleSig = data.tasks
    .filter((t) => t.rrule && !t.deletedAt && !t.archivedAt)
    .map((t) => `${t.id}${t.rrule}${t.date}`)
    .join();
  useEffect(() => {
    if (ready) actions.materialize(monthDatesList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, ruleSig, ready]);

  function go(step: 1 | -1) {
    onSelect(week ? addDays(selected, 7 * step) : addMonths(selected, step));
  }

  const arrow = "cal-press flex h-11 w-11 items-center justify-center text-muted hover:text-ink";

  return (
    <section aria-label="Calendar" className="select-none !px-1.5 !pb-0 !pt-1.5">
      <div className="cal-pages" data-mode={mode}>
        <CalendarPage
          mode="week"
          dates={weekDatesList}
          selected={selected}
          onSelect={onSelect}
          onPaging={go}
          onModeChange={onModeChange}
          active={week}
        />
        <CalendarPage
          mode="month"
          dates={monthDatesList}
          selected={selected}
          onSelect={onSelect}
          onPaging={go}
          onModeChange={onModeChange}
          active={!week}
          header={
            <>
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
              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] pb-0.5 text-center">
                {labels.map((label, i) => (
                  <div key={label + i} className="text-[11px] font-medium text-faint">
                    {label.slice(0, 1)}
                  </div>
                ))}
              </div>
            </>
          }
        />
      </div>

      <button
        onClick={() => onModeChange(week ? "month" : "week")}
        aria-label={week ? "Switch to month view" : "Switch to week view"}
        className="cal-press flex min-h-11 w-full items-center justify-center text-faint hover:text-ink"
      >
        <ChevronDown size={16} className="cal-mode-chevron" data-month={!week} />
      </button>
    </section>
  );
}
