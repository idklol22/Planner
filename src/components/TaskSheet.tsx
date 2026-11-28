import { useRef, useState, type ReactNode } from "react";
import { Collapse } from "./Collapse";
import { ChevronLeft } from "lucide-react";
import { addDays } from "../domain/dates";
import { TASK_KINDS, type Task } from "../domain/model";
import { parseDays, REPEAT_OPTIONS } from "../domain/recurrence";
import { activeCategories, subtaskProgress, subtasksOf } from "../domain/tasks";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";
import { useToast } from "../state/toast";
import { resolveInlineSave } from "./inlineSave";
import { NoteEditor } from "./NotesEditor";
import { TaskCheck } from "./TaskMark";
import { taskHref } from "./task-page/route";

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-line px-1 py-2">
      <div className="shrink-0 text-[13px] text-muted">{label}</div>
      <div className="flex min-w-0 items-center justify-end gap-3">{children}</div>
    </div>
  );
}

const controlClass = "bg-transparent py-1.5 text-right text-[16px] text-ink outline-none";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`ui-press min-h-11 min-w-11 text-[13px] font-semibold ${on ? "text-accent" : "text-faint"}`}
    >
      {on ? "On" : "Off"}
    </button>
  );
}

function SheetBody({
  task,
  onClose,
  onOpen,
}: {
  task: Task;
  onClose: () => void;
  onOpen: (id: string | null) => void;
}) {
  const { data, actions } = useStore();
  const notify = useToast();
  const [title, setTitle] = useState(task.title);
  const [subTitle, setSubTitle] = useState("");
  const subBlocked = useRef(false);

  const isSub = !!task.parentId;
  const parent = isSub ? data.tasks.find((t) => t.id === task.parentId) : undefined;
  const category = data.categories.find((c) => c.id === task.categoryId);
  const color = category ? catColor(category.color) : "var(--accent)";
  const subs = subtasksOf(data.tasks, task.id);
  const progress = subtaskProgress(data.tasks, task.id);
  const cats = activeCategories(data.categories);
  const repeatValue = task.rrule?.startsWith("days:") ? "custom" : (task.rrule ?? "");
  const customDays = task.rrule ? parseDays(task.rrule) : [];

  function commitTitle() {
    const clean = title.trim();
    if (!clean) setTitle(task.title);
    else if (clean !== task.title) actions.updateTask(task.id, { title: clean });
  }

  function addSubtask() {
    const attempt = resolveInlineSave(subTitle, subBlocked.current);
    if (!attempt.value) return;
    subBlocked.current = true;
    actions.addSubtask(task.id, attempt.value);
    setSubTitle("");
    subBlocked.current = false;
  }

  function setRepeat(value: string) {
    if (value === "custom") {
      actions.updateTask(task.id, { rrule: "days:1,3,5" });
    } else {
      actions.updateTask(task.id, { rrule: value || undefined });
    }
  }

  function toggleDay(day: number) {
    const next = customDays.includes(day) ? customDays.filter((d) => d !== day) : [...customDays, day];
    if (next.length === 0) return;
    actions.updateTask(task.id, { rrule: `days:${next.sort().join(",")}` });
  }

  return (
    <>
      <div className="shrink-0 px-4 pb-2 pt-[var(--safe-top)]">
        <div className="flex h-11 items-center justify-between">
          {isSub && parent ? (
            <button
              onClick={() => onOpen(parent.id)}
              className="ui-press flex min-h-11 min-w-0 items-center gap-1 py-1 pr-3 text-[13px] font-medium text-muted"
            >
              <ChevronLeft size={18} />
              <span className="truncate">{parent.title}</span>
            </button>
          ) : (
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Task</span>
          )}
          <div className="flex items-center gap-3">
            <a
              href={taskHref(task.id)}
              aria-label="Open as page"
              title="Open as page"
              className="ui-press flex min-h-11 items-center px-1 text-[12px] text-muted"
            >
              Open as page
            </a>
            <button onClick={onClose} aria-label="Close" className="ui-press flex min-h-11 items-center px-1 text-[12px] text-muted">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="flex items-start gap-3">
          <div className="pt-1.5">
            <TaskCheck
              checked={task.done}
              color={color}
              onToggle={() => actions.toggleTask(task.id)}
              size={28}
            />
          </div>
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            aria-label="Task title"
            className={`min-w-0 flex-1 resize-none bg-transparent py-1 text-[16px] font-semibold leading-tight tracking-tight outline-none [field-sizing:content] ${
              task.done ? "text-faint line-through decoration-ink/30" : ""
            }`}
          />
        </div>

        {!isSub && (
          <>
            <div className="no-scrollbar -mx-4 flex flex-wrap gap-x-4 px-4 pb-1">
              {cats.map((c) => {
                const on = c.id === task.categoryId;
                return (
                  <button
                    key={c.id}
                    onClick={() => actions.updateTask(task.id, { categoryId: c.id })}
                    className={`ui-press flex min-h-11 shrink-0 items-center gap-2 text-[13px] ${
                      on ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-[7px] w-[7px] rounded-full"
                      style={{ backgroundColor: catColor(c.color) }}
                    />
                    {c.name}
                  </button>
                );
              })}
              {cats.length === 0 && (
                <span className="py-2 text-[13px] text-faint">No categories yet. Add some from the menu.</span>
              )}
            </div>

            <div>
              <Field label="Date">
                <input
                  type="date"
                  value={task.date}
                  onChange={(e) => e.target.value && actions.moveTaskToDay(task.id, e.target.value)}
                  className={controlClass}
                />
              </Field>
              <Field label="Time">
                {task.time && (
                  <button
                    onClick={() => actions.updateTask(task.id, { time: undefined, durationMin: undefined })}
                    className="ui-press min-h-11 text-[12px] text-faint"
                  >
                    Clear
                  </button>
                )}
                <input
                  type="time"
                  value={task.time ?? ""}
                  onChange={(e) => actions.updateTask(task.id, { time: e.target.value || undefined })}
                  className={controlClass}
                />
              </Field>
              {task.time && (
                <Field label="Duration">
                  <select
                    value={task.durationMin ?? ""}
                    onChange={(e) =>
                      actions.updateTask(task.id, {
                        durationMin: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={controlClass}
                  >
                    <option value="">None</option>
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} min` : `${m / 60} h`}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Repeat">
                {task.seriesId ? (
                  <span className="text-[13px] text-faint">Part of a repeating series</span>
                ) : (
                  <select value={repeatValue} onChange={(e) => setRepeat(e.target.value)} className={controlClass}>
                    {REPEAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    <option value="custom">Custom days</option>
                  </select>
                )}
              </Field>
              <Collapse open={repeatValue === "custom"}>
                <div className="flex justify-between gap-1 px-1 py-3">
                  {DAY_NAMES.map((name, day) => {
                    const on = customDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        aria-pressed={on}
                        className={`ui-press h-11 w-9 text-[12px] font-semibold ${
                          on ? "text-accent underline underline-offset-4" : "text-faint"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </Collapse>
              <Field label="Deadline">
                <Switch on={task.deadline} label="Deadline" onChange={(v) => actions.updateTask(task.id, { deadline: v })} />
              </Field>
              <Field label="Kind">
                <select
                  value={task.kind}
                  onChange={(e) => actions.updateTask(task.id, { kind: e.target.value as Task["kind"] })}
                  className={`${controlClass} capitalize`}
                >
                  {TASK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <section>
              <div className="mb-2 flex items-center gap-2 px-1">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">Subtasks</h3>
                {progress.total > 0 && (
                  <span className="text-[12px] font-medium tabular-nums text-faint">
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
              <div>
                {subs.map((sub) => (
                  <div key={sub.id} className="animate-row flex min-h-11 items-center gap-3 border-b border-line px-1 py-1.5">
                    <TaskCheck
                      checked={sub.done}
                      color={color}
                      size={20}
                      onToggle={() => actions.toggleTask(sub.id)}
                      label={`Toggle ${sub.title}`}
                    />
                    <button
                      onClick={() => onOpen(sub.id)}
                      className={`ui-press min-w-0 flex-1 py-1.5 text-left text-[15px] ${
                        sub.done ? "text-faint line-through decoration-ink/30" : ""
                      }`}
                    >
                      {sub.title}
                    </button>
                    {sub.note?.content.trim() && <span className="text-[11px] text-faint">note</span>}
                    <button
                      onClick={() => actions.deleteTask(sub.id)}
                      aria-label={`Delete ${sub.title}`}
                      className="ui-press min-h-11 px-1 text-[12px] text-faint"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex min-h-11 items-center border-b border-line px-1">
                  <input
                    value={subTitle}
                    onChange={(e) => {
                      subBlocked.current = false;
                      setSubTitle(e.target.value);
                    }}
                    onBlur={addSubtask}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSubtask();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        subBlocked.current = true;
                        setSubTitle("");
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Add a subtask"
                    aria-label="Add a subtask"
                    className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-faint"
                  />
                </div>
              </div>
            </section>
          </>
        )}

        <NoteEditor task={task} />
      </div>

      <footer className="flex shrink-0 items-center gap-4 border-t border-line px-4 py-2 pb-[max(0.75rem,var(--safe-bottom))]">
        <button
          onClick={() => {
            actions.deleteTask(task.id);
            notify(isSub ? "Subtask deleted" : "Task deleted", "info");
            onClose();
          }}
          aria-label="Delete"
          className="ui-press min-h-11 text-[13px] font-medium text-rose"
        >
          Delete
        </button>
        <span className="flex-1" />
        {!isSub && (
          <>
            <button
              onClick={() => {
                actions.moveTaskToDay(task.id, addDays(task.date, 1));
                notify("Moved to the next day", "info");
                onClose();
              }}
              className="ui-press min-h-11 text-[13px] font-medium text-muted"
            >
              Tomorrow
            </button>
            <button
              onClick={() => {
                actions.duplicateTask(task.id);
                notify("Task duplicated", "info");
              }}
              className="ui-press min-h-11 text-[13px] font-medium text-muted"
            >
              Duplicate
            </button>
          </>
        )}
      </footer>
    </>
  );
}

/** Side panel on desktop, bottom sheet on phones. */
export function TaskSheet({
  taskId,
  closing = false,
  onOpen,
}: {
  taskId: string;
  /** Set by the owner while the panel is animating down (usePresence). */
  closing?: boolean;
  onOpen: (id: string | null) => void;
}) {
  const { data } = useStore();
  const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!task) return null;
  const close = () => onOpen(null);
  return (
    <>
      <button
        aria-label="Close task"
        onPointerDown={(e) => e.preventDefault()}
        onClick={close}
        className={`panel-backdrop fixed inset-0 z-40 cursor-default bg-scrim md:hidden ${closing ? "is-closing" : ""}`}
      />
      <aside
        role="dialog"
        aria-label="Task"
        className={`panel-sheet task-panel fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col overflow-hidden border-t border-line bg-canvas md:static md:z-auto md:h-full md:w-[380px] md:shrink-0 md:border-l md:border-t-0 lg:w-[460px] ${closing ? "is-closing" : ""}`}
      >
        <SheetBody key={task.id} task={task} onClose={close} onOpen={onOpen} />
      </aside>
    </>
  );
}
