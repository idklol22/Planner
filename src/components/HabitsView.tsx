import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ISODate } from "../domain/dates";
import { describeSchedule, partitionHabits } from "../domain/habits";
import type { Habit } from "../domain/model";
import { MOTION_MS, usePresence } from "../lib/motion";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";
import { HabitEditor } from "./HabitEditor";
import { useListExit } from "./listExit";

const ACTION = "ui-press min-h-11 px-2 text-[12px] text-muted";

/** Full-screen habits setup page: create, edit, archive and restore habits. */
export function HabitsView({ date }: { date: ISODate }) {
  const { data, actions } = useStore();
  const [editor, setEditor] = useState<{ habit?: Habit; id: number } | null>(null);
  const [shownEditor, setShownEditor] = useState<{ habit?: Habit; id: number } | null>(null);
  const editorSeq = useRef(0);
  const { active, archived } = partitionHabits(data.habits);
  const activeRows = useListExit(active);
  const archivedRows = useListExit(archived);

  // Keep the habit alive through the editor's slide-down.
  const editorPresence = usePresence(!!editor, MOTION_MS.base);
  if (editor && editor !== shownEditor) setShownEditor(editor);

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
      <p className="page-block mb-4 text-[12px] leading-relaxed text-muted">
        Habits are daily suggestions. Set their schedule and category here — they appear as faded rows on your day.
      </p>

      <div className="page-block mb-5 flex">
        <button
          onClick={() => flushSync(() => setEditor({ id: ++editorSeq.current }))}
          className="ui-press min-h-11 w-full text-left text-[14px] font-semibold text-accent sm:w-auto"
        >
          New habit
        </button>
      </div>

      {activeRows.length === 0 ? (
        <p className="page-block py-6 text-[13px] text-muted">
          No habits yet.
          <span className="mt-1 block text-[12px] text-faint">
            Tap a ghost row on your day to add it as a task.
          </span>
        </p>
      ) : (
        <div className="page-block">
          {activeRows.map(({ item: habit, exiting }) => (
            <div key={habit.id} className={`row-shell ${exiting ? "is-exiting" : ""}`}>
              <div className="flex min-h-14 items-center gap-3 border-b border-line">
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
                  onClick={() => setEditor({ habit, id: ++editorSeq.current })}
                  aria-label={`Edit ${habit.title}`}
                  className={ACTION}
                >
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
            </div>
          ))}
        </div>
      )}

      {archivedRows.length > 0 && (
        <section className="page-block mt-8">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Archived</h2>
          {archivedRows.map(({ item: habit, exiting }) => (
            <div key={habit.id} className={`row-shell ${exiting ? "is-exiting" : ""}`}>
              <div className="flex min-h-14 items-center gap-3 border-b border-line opacity-60">
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
            </div>
          ))}
        </section>
      )}

      {editorPresence.mounted && shownEditor && (
        <HabitEditor
          key={shownEditor.id}
          habit={shownEditor.habit}
          date={date}
          closing={editorPresence.closing}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
