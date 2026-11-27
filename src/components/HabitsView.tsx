import { useState } from "react";
import { Archive, ArchiveRestore, Settings2 } from "lucide-react";
import type { ISODate } from "../domain/dates";
import { describeSchedule, partitionHabits } from "../domain/habits";
import type { Habit } from "../domain/model";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";
import { HabitEditor } from "./HabitEditor";
import { Panel } from "./ui";

const ICON_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-faint transition-colors hover:bg-ink/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent";

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
      <p className="mb-4 px-1 text-[14px] leading-relaxed text-muted">
        Habits are daily suggestions. Set their schedule and category here — they appear as faded rows on your day.
      </p>

      <div className="mb-5 flex">
        <button
          onClick={() => setCreating(true)}
          className="h-11 w-full rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-ink transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
        >
          New habit
        </button>
      </div>

      {active.length === 0 ? (
        <div className="glass-panel border border-dashed border-ink/15 px-4 py-10 text-center text-[14px] text-muted">
          No habits yet.
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Habits show up as faded rows under their category. Tap a ghost to add it as a task.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((habit) => (
            <Panel key={habit.id} className="!p-0">
              <div className="flex min-h-[56px] items-center gap-3 px-3 transition-colors hover:bg-ink/[0.05]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor(habit) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{habit.title}</span>
                  <span className="block truncate text-[12px] text-faint">{detail(habit)}</span>
                </span>
                <button
                  onClick={() => setEditing(habit)}
                  aria-label={`Edit ${habit.title}`}
                  className={ICON_BTN}
                >
                  <Settings2 size={18} />
                </button>
                <button
                  onClick={() => actions.archiveHabit(habit.id, true)}
                  aria-label={`Archive ${habit.title}`}
                  className={ICON_BTN}
                >
                  <Archive size={18} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-faint">
            Archived
          </h2>
          <div className="space-y-2">
            {archived.map((habit) => (
              <Panel key={habit.id} className="!p-0">
                <div className="flex min-h-[56px] items-center gap-3 px-3 opacity-60 transition-colors hover:bg-ink/[0.05]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor(habit) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{habit.title}</span>
                    <span className="block truncate text-[12px] text-faint">{detail(habit)}</span>
                  </span>
                  <button
                    onClick={() => actions.archiveHabit(habit.id, false)}
                    className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-[13px] font-semibold hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ArchiveRestore size={15} /> Restore
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}

      {(creating || editing) && (
        <HabitEditor habit={editing ?? undefined} date={date} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}
