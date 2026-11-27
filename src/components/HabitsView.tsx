import { useState } from "react";
import type { ISODate } from "../domain/dates";
import { describeSchedule, partitionHabits } from "../domain/habits";
import type { Habit } from "../domain/model";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";
import { HabitEditor } from "./HabitEditor";

const ACTION = "min-h-11 px-2 text-[12px] text-muted";

/** Full-screen habits setup page: create, edit, archive and restore habits. */
export function HabitsView({ date }: { date: ISODate }) {
  const { data, actions } = useStore();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const { active, archived } = partitionHabits(data.habits);

  // Archived categories still supply the saved name/colour — the habit is not deleted.
  const categoryFor = (habit: Habit) =>
    data.categories.find((c) => c.id === habit.categoryId && !c.deletedAt);
  const detail = (habit: Habit) => {
    const cat = categoryFor(habit);
    return `${cat?.name ?? "Inbox"} · ${describeSchedule(habit)}`;
  };
  const dotColor = (habit: Habit) => {
    const cat = categoryFor(habit);
    return cat ? catColor(cat.color) : "var(--text-faint)";
  };

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      <p className="mb-4 text-[12px] leading-relaxed text-muted">
        Habits are daily suggestions. Set their schedule and category here — they appear as faded rows on your day.
      </p>

      <div className="mb-5 flex">
        <button
          onClick={() => setCreating(true)}
          className="min-h-11 w-full text-left text-[14px] font-semibold text-accent sm:w-auto"
        >
          New habit
        </button>
      </div>

      {active.length === 0 ? (
        <p className="py-6 text-[13px] text-muted">
          No habits yet.
          <span className="mt-1 block text-[12px] text-faint">
            Tap a ghost row on your day to add it as a task.
          </span>
        </p>
      ) : (
        <div>
          {active.map((habit) => (
            <div key={habit.id} className="flex min-h-14 items-center gap-3 border-b border-line">
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: dotColor(habit) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{habit.title}</span>
                <span className="block truncate text-[12px] text-faint">{detail(habit)}</span>
              </span>
              <button onClick={() => setEditing(habit)} aria-label={`Edit ${habit.title}`} className={ACTION}>
                Edit
              </button>
              <button
                onClick={() => actions.archiveHabit(habit.id, true)}
                aria-label={`Archive ${habit.title}`}
                className={ACTION}
              >
                Archive
              </button>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Archived</h2>
          {archived.map((habit) => (
            <div key={habit.id} className="flex min-h-14 items-center gap-3 border-b border-line opacity-60">
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: dotColor(habit) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{habit.title}</span>
                <span className="block truncate text-[12px] text-faint">{detail(habit)}</span>
              </span>
              <button
                onClick={() => actions.archiveHabit(habit.id, false)}
                aria-label={`Restore ${habit.title}`}
                className={ACTION}
              >
                Restore
              </button>
            </div>
          ))}
        </section>
      )}

      {(creating || editing) && (
        <HabitEditor habit={editing ?? undefined} date={date} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}
