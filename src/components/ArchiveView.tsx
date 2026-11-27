import { ArchiveRestore, Trash2 } from "lucide-react";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { catColor } from "../theme/store";
import { Panel } from "./ui";

const ACTION_BTN =
  "flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent";

/** Full-screen archive of tasks: restore them to their day or delete them for good. */
export function ArchiveView() {
  const { data, actions } = useStore();
  const notify = useToast();
  const archived = data.tasks
    .filter((t) => !!t.archivedAt && !t.deletedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));

  // Archived categories still supply the saved name/colour, so use them here too.
  const dotColor = (categoryId: string | null) => {
    const cat = data.categories.find((c) => c.id === categoryId && !c.deletedAt);
    return cat ? catColor(cat.color) : "var(--text-muted)";
  };

  const undo = { label: "Undo", run: actions.undoTaskChange, durationMs: 5000 } as const;

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      <h2 className="mb-4 px-1 text-[17px] font-semibold text-ink">Archived tasks</h2>
      {archived.length === 0 ? (
        <div className="glass-panel border border-dashed border-line-2 px-4 py-10 text-center text-[14px] text-muted">
          Nothing archived.
        </div>
      ) : (
        <div className="space-y-2">
          {archived.map((task) => (
            <Panel key={task.id} className="!p-0">
              <div className="flex min-h-[52px] items-center gap-3 px-3 py-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor(task.categoryId) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">{task.title}</div>
                  <div className="truncate text-[13px] text-muted">{task.date}</div>
                </div>
                <button
                  onClick={() => {
                    actions.restoreTask(task.id);
                    notify("Task restored", "success", undo);
                  }}
                  aria-label={`Restore ${task.title}`}
                  className={`${ACTION_BTN} bg-surface-2 text-ink hover:bg-surface-3`}
                  title="Restore"
                >
                  <ArchiveRestore size={16} /> Restore
                </button>
                <button
                  onClick={() => {
                    actions.deleteTask(task.id);
                    notify("Task deleted", "success", undo);
                  }}
                  aria-label={`Delete ${task.title}`}
                  className={`${ACTION_BTN} text-rose hover:bg-rose/10`}
                  title="Delete"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
