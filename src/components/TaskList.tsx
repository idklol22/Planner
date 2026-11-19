import { useState } from "react";
import { Check, FolderPlus, Plus, Trash2 } from "lucide-react";
import type { ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import { TaskItem } from "./TaskItem";
import { Button, IconButton, Input } from "./ui";

export function TaskList({
  date,
  selectedTaskId,
  onSelectTask,
}: {
  date: ISODate;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState("");
  const [headingId, setHeadingId] = useState("");
  const [headingDraft, setHeadingDraft] = useState("");
  const [showHeadingInput, setShowHeadingInput] = useState(false);
  const [editingHeading, setEditingHeading] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const headings = data.headings
    .filter((heading) => heading.date === date)
    .sort((a, b) => a.order - b.order);
  const tasks = data.tasks.filter(
    (task) => task.date === date || task.tags.includes("persistent"),
  );

  function addTask() {
    if (!title.trim()) return;
    actions.addTask(date, title.trim(), headingId || null);
    setTitle("");
  }

  function addHeading() {
    if (!headingDraft.trim()) return;
    actions.addHeading(date, headingDraft.trim());
    setHeadingDraft("");
    setShowHeadingInput(false);
  }

  function renderGroup(id: string | null, headingTitle?: string) {
    const group = tasks
      .filter((task) => task.headingId === id)
      .sort((a, b) => a.order - b.order);

    return (
      <div className="mb-6" key={id ?? "none"}>
        {headingTitle && (
          <div className="group mb-2.5 flex items-center gap-2">
            <span className="h-4 w-[3px] rounded-full bg-accent" />
            {editingHeading !== null && editingHeading === id ? (
              <>
                <Input
                  autoFocus
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      actions.updateHeading(id!, editingTitle);
                      setEditingHeading(null);
                    }
                    if (event.key === "Escape") setEditingHeading(null);
                  }}
                  className="max-w-xs py-1 text-sm"
                />
                <IconButton
                  onClick={() => {
                    actions.updateHeading(id!, editingTitle);
                    setEditingHeading(null);
                  }}
                  title="Save heading"
                >
                  <Check size={15} />
                </IconButton>
              </>
            ) : (
              <>
                <h3 className="text-[13px] font-semibold text-ink">{headingTitle}</h3>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-faint">
                  {group.length}
                </span>
                <div className="ml-auto flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton
                    onClick={() => {
                      setEditingHeading(id);
                      setEditingTitle(headingTitle);
                    }}
                    title="Rename heading"
                    className="h-6 w-6"
                  >
                    <span className="text-[11px]">✎</span>
                  </IconButton>
                  <IconButton
                    onClick={() => actions.deleteHeading(id!)}
                    title="Delete heading"
                    className="h-6 w-6 hover:text-rose"
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          {group.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onSelect={() => onSelectTask(task.id)}
            />
          ))}
          {group.length === 0 && (
            <p className="pl-1 text-[11px] text-faint">Nothing here yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-line bg-black/20 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Plus
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              value={title}
              placeholder="Add a task for this day…"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addTask()}
              className="pl-9"
            />
          </div>
          <select
            value={headingId}
            onChange={(event) => setHeadingId(event.target.value)}
            className="inset-field max-w-40 bg-surface-2 px-2.5 py-2 text-xs text-muted focus:outline-none"
          >
            <option value="">No heading</option>
            {headings.map((heading) => (
              <option key={heading.id} value={heading.id}>
                {heading.title}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={addTask}>
            Add
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          {showHeadingInput ? (
            <>
              <Input
                autoFocus
                value={headingDraft}
                placeholder="Heading name"
                onChange={(event) => setHeadingDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addHeading();
                  if (event.key === "Escape") setShowHeadingInput(false);
                }}
                className="max-w-xs"
              />
              <Button variant="primary" onClick={addHeading}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setShowHeadingInput(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <button
              onClick={() => setShowHeadingInput(true)}
              className="inline-flex items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-accent"
            >
              <FolderPlus size={13} /> Add a heading to group tasks
            </button>
          )}
        </div>
      </div>

      {headings.map((heading) => renderGroup(heading.id, heading.title))}
      {renderGroup(null, headings.length ? "Unsorted" : undefined)}
    </div>
  );
}
