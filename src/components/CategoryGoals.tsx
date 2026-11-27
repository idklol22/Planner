import { useRef, useState } from "react";
import { achievedGoals, openGoals, reorderedIds } from "../domain/goals";
import { useStore } from "../state/store";
import { TaskMark } from "./TaskMark";

/** Persistent goals of one category, independent of the selected day.
 *  Takes no space until there is a goal; new goals come from the one composer. */
export function CategoryGoals({ categoryId, color }: { categoryId: string; color: string }) {
  const { data, actions } = useStore();
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editValue = useRef("");
  const editCancelled = useRef(false);
  const open = openGoals(data.goals, categoryId);
  const done = achievedGoals(data.goals, categoryId);

  function saveEdit() {
    const text = editValue.current.trim();
    if (editing && text) actions.editGoal(editing, text);
    setEditing(null);
  }

  const row = (g: (typeof open)[number], i: number, isOpen: boolean) => (
    <li key={g.id} className="group flex min-h-11 items-center gap-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={!isOpen}
        aria-label={isOpen ? `Mark goal achieved: ${g.title}` : `Mark goal not achieved: ${g.title}`}
        onClick={() => (isOpen ? actions.achieveGoal(g.id) : actions.unachieveGoal(g.id))}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
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
          className={`min-w-0 flex-1 truncate py-2 text-left text-[13px] ${isOpen ? "text-ink" : "text-faint line-through"}`}
        >
          {g.title}
        </button>
      )}
      {isOpen && open.length > 1 && (
        <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Move goal up"
            disabled={i === 0}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i - 1))}
            className="h-11 px-1.5 text-[12px] text-faint hover:text-ink disabled:opacity-30"
          >
            Up
          </button>
          <button
            type="button"
            aria-label="Move goal down"
            disabled={i === open.length - 1}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i + 1))}
            className="h-11 px-1.5 text-[12px] text-faint hover:text-ink disabled:opacity-30"
          >
            Down
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={`Delete goal: ${g.title}`}
        onClick={() => actions.deleteGoal(g.id)}
        className="h-11 shrink-0 px-1.5 text-[12px] text-faint opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        Remove
      </button>
    </li>
  );

  if (open.length === 0 && done.length === 0) return null;

  return (
    <div aria-label="Goals" className="mb-1">
      {open.length > 0 && <ul>{open.map((g, i) => row(g, i, true))}</ul>}
      {done.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="min-h-11 text-[12px] text-muted hover:text-ink"
          >
            {showDone ? "Hide" : "Show"} achieved ({done.length})
          </button>
          {showDone && <ul>{done.map((g, i) => row(g, i, false))}</ul>}
        </>
      )}
    </div>
  );
}
