import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addDays, formatDay, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import { Button, Card, Empty, Input, SectionTitle } from "./ui";

export function HabitsView({ date, onDateChange }: { date: ISODate; onDateChange: (d: ISODate) => void }) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");

  const window = Array.from({ length: 7 }, (_, index) => addDays(date, index - 6));

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <SectionTitle>Habits</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            placeholder="New habit (e.g. Read 20 pages)"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addHabit()}
            className="min-w-56 flex-1"
          />
          <select
            value={cadence}
            onChange={(event) => setCadence(event.target.value as "daily" | "weekly")}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-300 outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <Button onClick={addHabit}>
            <Plus size={16} /> Add habit
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Week ending {formatDay(date)}</h3>
          <input
            type="date"
            value={date}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none"
          />
        </div>

        {data.habits.length === 0 ? (
          <Empty>No habits yet. Add one above to start tracking.</Empty>
        ) : (
          <div className="space-y-3">
            {data.habits.map((habit) => (
              <div
                key={habit.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="min-w-36 flex-1">
                  <div className="text-sm font-medium text-slate-200">{habit.title}</div>
                  <div className="text-xs text-slate-500">
                    {habit.cadence} · {streak(habit.completedDates)} day streak
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {window.map((day) => {
                    const done = habit.completedDates.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => actions.toggleHabitDate(habit.id, day)}
                        title={formatDay(day)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs ring-1 ring-inset transition-colors ${
                          done
                            ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30"
                            : "bg-white/5 text-slate-500 ring-white/10 hover:text-slate-300"
                        }`}
                      >
                        {Number(day.slice(-2))}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => actions.deleteHabit(habit.id)}
                  title="Delete habit"
                  className="px-2 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
