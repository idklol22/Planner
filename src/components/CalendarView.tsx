import { useState } from "react";
import { ChevronLeft, ChevronRight, Flame, Repeat } from "lucide-react";
import {
  formatDay,
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
import { Button, Card, Chip, SectionTitle } from "./ui";

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
  const { data, actions } = useStore();
  const [cursor, setCursor] = useState<ISODate>(startOfMonth(selectedDate));
  const today = todayISO();
  const isToday = selectedDate === today;

  const cells = monthGrid(cursor);
  const labels = weekdayLabels();

  function shiftMonth(delta: number) {
    const date = fromISODate(cursor);
    date.setMonth(date.getMonth() + delta);
    setCursor(startOfMonth(toISODate(date)));
  }

  function dayCounts(date: ISODate) {
    const tasks = data.tasks.filter(
      (task) => task.date === date || task.tags.includes("persistent"),
    );
    const habits = data.habits.filter((habit) => habit.completedDates.includes(date)).length;
    const calories = data.calories.filter((entry) => entry.date === date).length;
    return { tasks, habits, calories };
  }

  const selectedTasks = data.tasks.filter(
    (task) => task.date === selectedDate || task.tags.includes("persistent"),
  );
  const dayCalories = data.calories
    .filter((entry) => entry.date === selectedDate)
    .reduce((sum, entry) => sum + entry.kcal, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(360px,1fr)_minmax(440px,1.1fr)]">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            {formatMonth(cursor)}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCursor(startOfMonth(today))}>
              Today
            </Button>
            <Button variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {labels.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date) => {
            const counts = dayCounts(date);
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const inMonth = sameMonth(date, cursor);
            return (
              <button
                key={date}
                onClick={() => onSelectDate(date)}
                className={`relative flex h-16 flex-col items-center justify-start rounded-lg border p-1.5 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-400/60 bg-indigo-500/15"
                    : isToday
                      ? "border-indigo-400/30 bg-white/5"
                      : "border-transparent hover:bg-white/5"
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <span
                  className={`text-xs font-medium ${
                    isToday ? "text-indigo-300" : "text-slate-300"
                  }`}
                >
                  {Number(date.slice(-2))}
                </span>
                <div className="mt-auto flex items-center gap-1">
                  {counts.tasks.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  )}
                  {counts.habits > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                  {counts.calories > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-white/5 pt-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> Tasks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Habits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Meals
          </span>
        </div>
      </Card>

      <Card>
        <SectionTitle
          action={
            isToday ? (
              <Chip tone="indigo">Today</Chip>
            ) : (
              <Button variant="ghost" onClick={() => onSelectDate(today)}>
                Jump to today
              </Button>
            )
          }
        >
          {formatDay(selectedDate)}
        </SectionTitle>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Repeat size={14} /> Habits
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.habits.length === 0 && (
                <span className="text-xs text-slate-600">No habits yet</span>
              )}
              {data.habits.map((habit) => {
                const done = habit.completedDates.includes(selectedDate);
                return (
                  <button
                    key={habit.id}
                    onClick={() => actions.toggleHabitDate(habit.id, selectedDate)}
                    className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors ${
                      done
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                        : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"
                    }`}
                  >
                    {habit.title} {done ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Flame size={14} /> Calories
            </div>
            <div className="text-xl font-semibold text-slate-100">
              {dayCalories}
              <span className="ml-1 text-xs font-normal text-slate-500">
                / {data.settings.dailyCalorieGoal} kcal
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (dayCalories / Math.max(1, data.settings.dailyCalorieGoal)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        <TaskList
          date={selectedDate}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
        />

        {selectedTasks.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-600">
            {selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"} on this day
          </p>
        )}
      </Card>
    </div>
  );
}
