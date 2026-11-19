import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Flame, Repeat } from "lucide-react";
import {
  formatMonth,
  fromISODate,
  monthGrid,
  sameMonth,
  startOfMonth,
  toISODate,
  todayISO,
  weekdayLabels,
  type ISODate,
} from "../domain/dates";
import { useStore } from "../state/store";
import { TaskList } from "./TaskList";
import { Chip, Panel, ProgressRing } from "./ui";

export function CalendarView({
  selectedDate,
  onSelectDate,
  selectedTaskId,
  onSelectTask,
}: {
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const { data } = useStore();
  const [cursor, setCursor] = useState<ISODate>(startOfMonth(selectedDate));
  const today = todayISO();
  const cells = monthGrid(cursor);
  const labels = weekdayLabels();

  function shiftMonth(delta: number) {
    const date = fromISODate(cursor);
    date.setMonth(date.getMonth() + delta);
    setCursor(startOfMonth(toISODate(date)));
  }

  const longDate = fromISODate(selectedDate).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const dayTasks = data.tasks.filter(
    (task) => task.date === selectedDate || task.tags.includes("persistent"),
  );
  const doneCount = dayTasks.filter((task) => task.done).length;
  const dayHabits = data.habits.filter((habit) =>
    habit.completedDates.includes(selectedDate),
  ).length;
  const dayCalories = data.calories
    .filter((entry) => entry.date === selectedDate)
    .reduce((sum, entry) => sum + entry.kcal, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(460px,1.15fr)]">
      <Panel className="h-fit">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Overview
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              {formatMonth(cursor)}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setCursor(startOfMonth(today));
                onSelectDate(today);
              }}
              className="mr-1 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-2 hover:text-ink"
            >
              Today
            </button>
            <button
              onClick={() => shiftMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-2 hover:text-ink"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => shiftMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-2 hover:text-ink"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {labels.map((label) => (
            <div
              key={label}
              className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-faint"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date) => {
            const inMonth = sameMonth(date, cursor);
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const tasks = data.tasks.filter(
              (task) => task.date === date || task.tags.includes("persistent"),
            );
            const habits = data.habits.filter((habit) =>
              habit.completedDates.includes(date),
            ).length;
            const meals = data.calories.filter((entry) => entry.date === date).length;

            return (
              <button
                key={date}
                onClick={() => onSelectDate(date)}
                className={`group relative flex h-[62px] flex-col items-center justify-between rounded-xl border px-1 py-2 transition-all ${
                  isSelected
                    ? "border-accent/60 bg-accent/15 shadow-[0_0_0_1px_rgba(139,124,255,0.25),0_10px_30px_-16px_rgba(139,124,255,0.9)]"
                    : isToday
                      ? "border-amber/30 bg-amber/[0.06] hover:bg-amber/[0.1]"
                      : "border-transparent hover:border-line hover:bg-white/[0.035]"
                } ${inMonth ? "" : "opacity-30"}`}
              >
                <span
                  className={`text-[13px] font-medium tabular-nums ${
                    isSelected ? "text-white" : isToday ? "text-amber" : "text-muted"
                  }`}
                >
                  {Number(date.slice(-2))}
                </span>
                <div className="flex items-center gap-1">
                  {tasks.length > 0 && (
                    <span
                      className={`h-1.5 rounded-full ${isSelected ? "bg-accent" : "bg-accent/60"}`}
                      style={{ width: `${Math.min(14, 4 + tasks.length * 3)}px` }}
                    />
                  )}
                  {habits > 0 && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
                  {meals > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-[10px] text-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-accent" /> Tasks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Habits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Meals
          </span>
        </div>
      </Panel>

      <Panel className="min-w-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              <CalendarDays size={12} /> Day board
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{longDate}</h2>
          </div>
          {selectedDate === today ? (
            <Chip tone="accent">Today</Chip>
          ) : (
            <button
              onClick={() => onSelectDate(today)}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted hover:border-line-2 hover:text-ink"
            >
              Jump to today
            </button>
          )}
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="panel-soft flex items-center gap-4 p-4">
            <ProgressRing
              value={dayHabits}
              max={Math.max(1, data.habits.length)}
              size={62}
              stroke={6}
              color="var(--color-mint)"
            >
              <span className="text-[13px] font-semibold text-ink">
                {data.habits.length ? dayHabits : 0}
              </span>
            </ProgressRing>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                <Repeat size={13} className="text-mint" /> Habits
              </div>
              <p className="mt-1 truncate text-[11px] text-faint">
                {data.habits.length ? `${dayHabits} of ${data.habits.length} checked` : "None yet"}
              </p>
            </div>
          </div>

          <div className="panel-soft flex items-center gap-4 p-4">
            <ProgressRing
              value={dayCalories}
              max={data.settings.dailyCalorieGoal}
              size={62}
              stroke={6}
              color="var(--color-amber)"
            >
              <Flame size={17} className="text-amber" />
            </ProgressRing>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-ink">Calories</div>
              <p className="mt-1 truncate text-[11px] text-faint">
                {dayCalories} / {data.settings.dailyCalorieGoal} kcal
              </p>
            </div>
          </div>

          <div className="panel-soft col-span-full flex items-center justify-between px-4 py-3">
            <span className="text-[11px] text-muted">Tasks completed</span>
            <span className="text-sm font-semibold text-ink">
              {doneCount} <span className="text-faint">/ {dayTasks.length}</span>
            </span>
          </div>
        </div>

        <TaskList
          date={selectedDate}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
        />
      </Panel>
    </div>
  );
}
