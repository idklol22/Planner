import { useRef, useState, type RefObject } from "react";
import { achievedGoals, openGoals, reorderedIds } from "../domain/goals";
import { MOTION_MS, usePresence } from "../lib/motion";
import { MotionRow, useFlipRows, useMotionRows } from "../motion/dayMotion";
import { useStore } from "../state/store";
import { InlineAdd, type InlineController, type InlineState } from "./InlineAdd";
import { TaskMark } from "./TaskMark";

/** Persistent goals of one category, independent of the selected day.
 *  Takes no space until there is a goal or the goals popover opens a field. */
export function CategoryGoals({
  categoryId,
  color,
  inline,
  controllerRef,
  onCloseInline,
}: {
  categoryId: string;
  color: string;
  inline: InlineState | null;
  controllerRef: RefObject<InlineController | null>;
  onCloseInline: () => void;
}) {
  const { data, actions } = useStore();
  const [showDone, setShowDone] = useState(false);
  const shownDone = usePresence(showDone, MOTION_MS.base);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editValue = useRef("");
  const editCancelled = useRef(false);
  const open = openGoals(data.goals, categoryId);
  const done = achievedGoals(data.goals, categoryId);
  const openRows = useMotionRows(open);
  const doneRows = useMotionRows(done);
  const flipOpen = useFlipRows(open.map((g) => g.id));
  const flipDone = useFlipRows(done.map((g) => g.id));
  const goalField = inline?.kind === "goal" && inline.target === categoryId ? inline : null;

  function saveEdit() {
    const text = editValue.current.trim();
    if (editing && text) actions.editGoal(editing, text);
    setEditing(null);
  }

  const row = (g: (typeof open)[number], i: number, isOpen: boolean) => (
    <div className="group flex min-h-11 items-center gap-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={!isOpen}
        aria-label={isOpen ? `Mark goal achieved: ${g.title}` : `Mark goal not achieved: ${g.title}`}
        onClick={() => (isOpen ? actions.achieveGoal(g.id) : actions.unachieveGoal(g.id))}
        className="day-press flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <TaskMark color={color} done={!isOpen} size={18} />
      </button>
      {editing === g.id ? (
        <input
          autoFocus
          value={editDraft}
          aria-label="Edit goal"
          onChange={(e) => {
            editValue.current = e.target.value;
            setEditDraft(e.target.value);
          }}
          onBlur={() => {
            if (editCancelled.current) {
              editCancelled.current = false;
              setEditing(null);
              return;
            }
            saveEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              editCancelled.current = true;
              setEditing(null);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(g.id);
            editValue.current = g.title;
            setEditDraft(g.title);
            editCancelled.current = false;
          }}
          className={`day-press min-w-0 flex-1 py-2 text-left text-[13px] ${isOpen ? "text-ink" : "text-faint"}`}
        >
          <span className="day-title-wrap">
            <span>{g.title}</span>
            <span aria-hidden className={`day-strike ${isOpen ? "" : "on"}`} />
          </span>
        </button>
      )}
      {isOpen && open.length > 1 && (
        <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Move goal up"
            disabled={i === 0}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i - 1))}
            className="day-press h-11 px-1.5 text-[12px] text-faint hover:text-ink disabled:opacity-30"
          >
            Up
          </button>
          <button
            type="button"
            aria-label="Move goal down"
            disabled={i === open.length - 1}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i + 1))}
            className="day-press h-11 px-1.5 text-[12px] text-faint hover:text-ink disabled:opacity-30"
          >
            Down
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={`Delete goal: ${g.title}`}
        onClick={() => actions.deleteGoal(g.id)}
        className="day-press h-11 shrink-0 px-1.5 text-[12px] text-faint opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        Remove
      </button>
    </div>
  );

  if (open.length === 0 && done.length === 0 && !goalField) return null;

  return (
    <div aria-label="Goals" className="mb-1">
      {open.length > 0 && (
        <ul>
          {openRows.rows.map(({ item: g, present, entering }, i) => (
            <MotionRow
              as="li"
              key={g.id}
              present={present}
              entering={entering}
              exitMs={openRows.exitMs}
              innerRef={flipOpen(g.id)}
              onExited={() => openRows.drop(g.id)}
            >
              {row(g, i, true)}
            </MotionRow>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="day-press min-h-11 text-[12px] text-muted hover:text-ink"
          >
            {showDone ? "Hide" : "Show"} achieved ({done.length})
          </button>
          {shownDone.mounted && (
            <MotionRow present={showDone}>
              <ul>
                {doneRows.rows.map(({ item: g, present, entering }, i) => (
                  <MotionRow
                    as="li"
                    key={g.id}
                    present={present}
                    entering={entering}
                    exitMs={doneRows.exitMs}
                    innerRef={flipDone(g.id)}
                    onExited={() => doneRows.drop(g.id)}
                  >
                    {row(g, i, false)}
                  </MotionRow>
                ))}
              </ul>
            </MotionRow>
          )}
        </>
      )}
      {goalField && (
        <InlineAdd
          key={goalField.id}
          date={goalField.date}
          target={categoryId}
          kind="goal"
          placeholder="New goal"
          onClose={onCloseInline}
          controllerRef={controllerRef}
        />
      )}
    </div>
  );
}
