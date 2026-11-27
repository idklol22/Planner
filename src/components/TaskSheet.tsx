import { useState, type ReactNode } from "react";
import { ChevronLeft, Copy, FileText, ListChecks, Plus, SunMoon, Trash2, X } from "lucide-react";
import { addDays } from "../domain/dates";
import { TASK_KINDS, type Task } from "../domain/model";
import { parseDays, REPEAT_OPTIONS } from "../domain/recurrence";
import { activeCategories, subtaskProgress, subtasksOf } from "../domain/tasks";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";
import { useToast } from "../state/toast";
import { TaskCheck } from "./TaskMark";
import { NoteEditor } from "./NotesEditor";
import { taskHref } from "./task-page/route";

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2">
      <div className="shrink-0 text-[13.5px] text-muted">{label}</div>
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

const controlClass =
  "rounded-lg bg-surface-2 px-3 py-1.5 text-[16px] text-ink outline-none transition-colors hover:bg-surface-3 focus:bg-surface-3";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-3"}`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full transition-all duration-200 ${
          on ? "left-[23px] bg-accent-ink" : "left-[3px] bg-ink/70"
        }`}
      />
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
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/20 md:hidden" />
        <div className="flex h-9 items-center justify-between">
          {isSub && parent ? (
            <button
              onClick={() => onOpen(parent.id)}
              className="flex min-w-0 items-center gap-1 rounded-full py-1 pr-3 text-[13px] font-medium text-muted hover:text-ink"
            >
              <ChevronLeft size={18} />
              <span className="truncate">{parent.title}</span>
            </button>
          ) : (
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Task</span>
          )}
          <div className="flex items-center gap-2">
          <a
            href={taskHref(task.id)}
            aria-label="Open as page"
            title="Open as page"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90"
          >
            <FileText size={17} />
          </a>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90"
          >
            <X size={18} />
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
            className={`min-w-0 flex-1 resize-none bg-transparent py-1 text-[18px] font-bold leading-tight tracking-tight outline-none [field-sizing:content] ${
              task.done ? "text-faint line-through decoration-ink/30" : ""
            }`}
          />
        </div>

        {!isSub && (
          <>
            <div>
              <div className="no-scrollbar -mx-4 flex flex-wrap gap-2 px-4 pb-1">
                {cats.map((c) => {
                  const on = c.id === task.categoryId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => actions.updateTask(task.id, { categoryId: c.id })}
                      className="flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-95"
                      style={{
                        color: catColor(c.color),
                        background: on ? `${catColor(c.color)}26` : "var(--surface-raised)",
                        boxShadow: on ? `inset 0 0 0 1.5px ${catColor(c.color)}` : "none",
                      }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: catColor(c.color) }} />
                      {c.name}
                    </button>
                  );
                })}
                {cats.length === 0 && (
                  <span className="py-2 text-[13px] text-faint">No categories yet. Add some from the menu.</span>
                )}
              </div>
            </div>

            <div className="glass-panel divide-y divide-line overflow-hidden">
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
                    className="text-[12px] text-faint hover:text-ink"
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
                  <select
                    value={repeatValue}
                    onChange={(e) => setRepeat(e.target.value)}
                    className={controlClass}
                  >
                    {REPEAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    <option value="custom">Custom days</option>
                  </select>
                )}
              </Field>
              {repeatValue === "custom" && (
                <div className="flex justify-between gap-1 px-4 py-3">
                  {DAY_NAMES.map((name, day) => {
                    const on = customDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        aria-pressed={on}
                        className={`h-9 w-9 rounded-full text-[12px] font-semibold transition-colors ${
                          on ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:bg-surface-3"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
              <Field label="Deadline">
                <Switch
                  on={task.deadline}
                  label="Deadline"
                  onChange={(v) => actions.updateTask(task.id, { deadline: v })}
                />
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
                <ListChecks size={15} className="text-faint" />
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">Subtasks</h3>
                {progress.total > 0 && (
                  <span className="text-[12px] font-medium tabular-nums text-faint">
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
              <div className="glass-panel overflow-hidden">
                {subs.map((sub) => (
                  <div
                    key={sub.id}
                    className="animate-row flex min-h-[48px] items-center gap-3 border-b border-line px-3 py-1.5"
                  >
                    <TaskCheck
                      checked={sub.done}
                      color={color}
                      size={20}
                      onToggle={() => actions.toggleTask(sub.id)}
                      label={`Toggle ${sub.title}`}
                    />
                    <button
                      onClick={() => onOpen(sub.id)}
                      className={`min-w-0 flex-1 truncate py-1.5 text-left text-[16px] ${
                        sub.done ? "text-faint line-through decoration-ink/30" : ""
                      }`}
                    >
                      {sub.title}
                    </button>
                    {sub.note?.content.trim() && <span className="text-[11px] text-faint">note</span>}
                    <button
                      onClick={() => actions.deleteTask(sub.id)}
                      aria-label={`Delete ${sub.title}`}
                      className="text-faint transition-colors hover:text-rose"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <div className="flex min-h-[48px] items-center gap-3 px-3">
                  <Plus size={20} className="text-faint" />
                  <input
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && subTitle.trim()) {
                        actions.addSubtask(task.id, subTitle);
                        setSubTitle("");
                      }
                    }}
                    placeholder="Add a subtask"
                    className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-faint"
                  />
                </div>
              </div>
            </section>
          </>
        )}

        <NoteEditor task={task} />
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,var(--safe-bottom))]">
        <button
          onClick={() => {
            actions.deleteTask(task.id);
            notify(isSub ? "Subtask deleted" : "Task deleted", "info");
            onClose();
          }}
          aria-label="Delete"
          className="flex items-center gap-1.5 rounded-full bg-rose/10 px-4 py-2.5 text-[13px] font-semibold text-rose transition-colors hover:bg-rose/20 active:scale-95"
        >
          <Trash2 size={16} /> <span className="hidden min-[420px]:inline">Delete</span>
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
              className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-surface-3 active:scale-95"
            >
              <SunMoon size={16} /> Tomorrow
            </button>
            <button
              onClick={() => {
                actions.duplicateTask(task.id);
                notify("Task duplicated", "info");
              }}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-surface-3 active:scale-95"
            >
              <Copy size={16} /> Duplicate
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
  onOpen,
}: {
  taskId: string;
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
        onClick={close}
        className="animate-fade fixed inset-0 z-40 cursor-default bg-scrim backdrop-blur-[2px] md:hidden"
      />
      <aside
        role="dialog"
        aria-label="Task"
        className="sheet-panel glass-panel fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col overflow-hidden border-t border-line-2 md:static md:z-auto md:h-full md:w-[380px] md:shrink-0 md:border-l md:border-t-0 lg:w-[460px]"
      >
        <SheetBody key={task.id} task={task} onClose={close} onOpen={onOpen} />
      </aside>
    </>
  );
}
