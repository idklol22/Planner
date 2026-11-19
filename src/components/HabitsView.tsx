import { useState } from "react";
import { Flame, Plus, Repeat, Trash2 } from "lucide-react";
import { addDays, formatDay, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import { Button, Chip, Empty, Input, Panel, SectionTitle } from "./ui";

export function HabitsView({
  date,
  onDateChange,
}: {
  date: ISODate;
  onDateChange: (date: ISODate) => void;
}) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");

  const week = Array.from({ length: 7 }, (_, index) => addDays(date, index - 6));

  function addHabit() {
    if (!title.trim()) return;
    actions.addHabit(title.trim(), cadence);
    setTitle("");
  }

  function streak(completed: string[]): number {
    let count = 0;
    let cursor = date;
    while (completed.includes(cursor)) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  const completedToday = data.habits.filter((habit) =>
    habit.completedDates.includes(date),
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        eyebrow="Consistency"
        action={
          <Chip tone="mint">
            {completedToday}/{data.habits.length} today
          </Chip>
        }
      >
        Habits
      </SectionTitle>

      <Panel className="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Plus
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              value={title}
              placeholder="New habit — e.g. Read 20 pages"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addHabit()}
              className="pl-9"
            />
          </div>
          <select
            value={cadence}
            onChange={(event) => setCadence(event.target.value as "daily" | "weekly")}
            className="inset-field bg-surface-2 px-3 py-2 text-xs text-muted focus:outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <Button variant="primary" onClick={addHabit}>
            <Plus size={15} /> Add habit
          </Button>
        </div>
      </Panel>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <Repeat size={13} className="text-mint" /> Rolling 7 days ending{" "}
          {formatDay(date)}
        </div>
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && onDateChange(event.target.value)}
          className="inset-field bg-surface-2 px-2.5 py-1.5 text-[11px] text-muted focus:outline-none"
        />
      </div>

      {data.habits.length === 0 ? (
        <Panel>
          <Empty
            icon={<Repeat size={26} />}
            title="No habits yet"
            hint="Add one above and start checking off days."
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {data.habits.map((habit) => {
            const currentStreak = streak(habit.completedDates);
            const weekCount = week.filter((day) =>
              habit.completedDates.includes(day),
            ).length;
            return (
              <Panel key={habit.id} className="group !p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-44 flex-1">
                    <div className="text-sm font-medium text-ink">{habit.title}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Chip tone="slate">{habit.cadence}</Chip>
                      {currentStreak > 0 && (
                        <Chip tone="amber">
                          <Flame size={10} /> {currentStreak} day streak
                        </Chip>
                      )}
                      <span className="text-[10px] text-faint">{weekCount}/7 this week</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {week.map((day) => {
                      const done = habit.completedDates.includes(day);
                      return (
                        <button
                          key={day}
                          onClick={() => actions.toggleHabitDate(habit.id, day)}
                          title={formatDay(day)}
                          className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl border transition-all ${
                            done
                              ? "border-mint/40 bg-mint/15 text-mint shadow-[0_0_18px_-10px_var(--color-mint)]"
                              : "border-line bg-white/[0.02] text-faint hover:border-line-2 hover:text-muted"
                          }`}
                        >
                          <span className="text-[9px] uppercase opacity-70">
                            {formatDay(day).split(" ")[0]}
                          </span>
                          <span className="text-xs font-semibold tabular-nums">
                            {Number(day.slice(-2))}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => actions.deleteHabit(habit.id)}
                    className="text-faint opacity-0 transition-opacity hover:text-rose group-hover:opacity-100"
                    title="Delete habit"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
