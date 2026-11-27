import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { achievedGoals, openGoals, reorderedIds } from "../domain/goals";
import { useStore } from "../state/store";
import { TaskMark } from "./TaskMark";

/** Persistent goals of one category: pinned at the top of its card, independent of the selected day.
 *  Takes no space until there is a goal; the card header opens the input through `adding`. */
export function CategoryGoals({
  categoryId,
  color,
  adding,
  onAddingChange: setAdding,
}: {
  categoryId: string;
  color: string;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
}) {
  const { data, actions } = useStore();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const open = openGoals(data.goals, categoryId);
  const done = achievedGoals(data.goals, categoryId);

  const commitAdd = () => {
    if (draft.trim()) actions.addGoal(categoryId, draft);
    setDraft("");
  };

  const row = (g: (typeof open)[number], i: number, isOpen: boolean) => (
    <li key={g.id} className="group flex items-center gap-2 py-[3px]">
      <button
        type="button"
        role="checkbox"
        aria-checked={!isOpen}
        aria-label={isOpen ? `Mark goal achieved: ${g.title}` : `Mark goal not achieved: ${g.title}`}
        onClick={() => (isOpen ? actions.achieveGoal(g.id) : actions.unachieveGoal(g.id))}
        className="flex h-6 w-6 shrink-0 items-center justify-center"
      >
        <TaskMark color={color} done={!isOpen} size={18} />
      </button>
      {editing === g.id ? (
        <input
          autoFocus
          value={editDraft}
          aria-label="Edit goal"
          onChange={(e) => setEditDraft(e.target.value)}
          onBlur={() => {
            actions.editGoal(g.id, editDraft);
            setEditing(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(null);
          }}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(g.id);
            setEditDraft(g.title);
          }}
          className={`min-w-0 flex-1 truncate text-left text-[12px] ${isOpen ? "text-ink" : "text-faint line-through"}`}
        >
          {g.title}
        </button>
      )}
      {isOpen && open.length > 1 && (
        <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Move goal up"
            disabled={i === 0}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i - 1))}
            className="text-faint hover:text-ink disabled:opacity-30"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            aria-label="Move goal down"
            disabled={i === open.length - 1}
            onClick={() => actions.reorderGoals(reorderedIds(open, g.id, i + 1))}
            className="text-faint hover:text-ink disabled:opacity-30"
          >
            <ChevronDown size={13} />
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={`Delete goal: ${g.title}`}
        onClick={() => actions.deleteGoal(g.id)}
        className="text-faint opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        <X size={13} />
      </button>
    </li>
  );

  if (open.length === 0 && done.length === 0 && !adding) return null;

  return (
    <div aria-label="Goals" className="goals mb-1 border-b border-line pb-1">
      {(open.length > 0 || adding) && (
        <ul className="mt-0.5">
          {open.map((g, i) => row(g, i, true))}
          {adding && (
            <li className="py-[3px]">
              <input
                autoFocus
                value={draft}
                placeholder="New goal"
                aria-label="New goal"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  commitAdd();
                  setAdding(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitAdd(); // stay open for the next goal
                  }
                  if (e.key === "Escape") {
                    setDraft("");
                    setAdding(false);
                  }
                }}
                className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
              />
            </li>
          )}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink"
          >
            {showDone ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Achieved ({done.length})
          </button>
          {showDone && <ul>{done.map((g, i) => row(g, i, false))}</ul>}
        </>
      )}
    </div>
  );
}
