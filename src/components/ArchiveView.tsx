import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { catColor } from "../theme/store";
import { useListExit } from "./listExit";

const ACTION = "ui-press min-h-11 px-2 text-[12px] font-medium";

/** Full-screen archive of tasks: restore them to their day or delete them for good. */
export function ArchiveView() {
  const { data, actions } = useStore();
  const notify = useToast();
  const archived = data.tasks
    .filter((t) => !!t.archivedAt && !t.deletedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const rows = useListExit(archived);

  // Archived categories still supply the saved name/colour, so use them here too.
  const dotColor = (categoryId: string | null) => {
    const cat = data.categories.find((c) => c.id === categoryId && !c.deletedAt);
    return cat ? catColor(cat.color) : "var(--text-muted)";
  };

  const undo = { label: "Undo", run: actions.undoTaskChange, durationMs: 5000 } as const;

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      <h2 className="page-block mb-3 px-1 text-[15px] font-semibold text-ink">Archived tasks</h2>
      {rows.length === 0 ? (
        <p className="page-block py-6 text-[13px] text-muted">Nothing archived.</p>
      ) : (
        <div className="page-block">
          {rows.map(({ item: task, exiting }) => (
            <div key={task.id} className={`row-shell ${exiting ? "is-exiting" : ""}`}>
              <div className="flex min-h-14 items-center gap-3 border-b border-line">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor(task.categoryId) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{task.title}</div>
                  <div className="truncate text-[12px] text-muted">{task.date}</div>
                </div>
                <button
                  onClick={() => {
                    actions.restoreTask(task.id);
                    notify("Task restored", "success", undo);
                  }}
                  aria-label={`Restore ${task.title}`}
                  className={`${ACTION} text-ink`}
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    actions.deleteTask(task.id);
                    notify("Task deleted", "success", undo);
                  }}
                  aria-label={`Delete ${task.title}`}
                  className={`${ACTION} text-rose`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
