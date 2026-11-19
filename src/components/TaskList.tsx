import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
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
  const [editingHeading, setEditingHeading] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const headings = data.headings
    .filter((heading) => heading.date === date)
    .sort((a, b) => a.order - b.order);
  // Persistent tasks are anchored to their original day but shown on every day.
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
  }

  function renderGroup(id: string | null, headingTitle?: string) {
    const group = tasks
      .filter((task) => task.headingId === id)
      .sort((a, b) => a.order - b.order);

    return (
      <div className="mb-5" key={id ?? "none"}>
        {headingTitle && (
          <div className="mb-2 flex items-center gap-2">
            {editingHeading === id ? (
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
                  className="py-1 text-sm"
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
                <h4 className="text-sm font-semibold text-slate-300">{headingTitle}</h4>
                <IconButton
                  onClick={() => {
                    setEditingHeading(id);
                    setEditingTitle(headingTitle);
                  }}
                  title="Rename heading"
                >
                  <span className="text-xs">✎</span>
                </IconButton>
                <IconButton
                  onClick={() => actions.deleteHeading(id!)}
                  title="Delete heading"
                  className="hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </IconButton>
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
            <p className="pl-1 text-xs text-slate-600">No tasks in this section.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            placeholder="Add a task for this day…"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addTask()}
            className="min-w-48 flex-1"
          />
          <select
            value={headingId}
            onChange={(event) => setHeadingId(event.target.value)}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-sm text-slate-300 outline-none"
          >
            <option value="">No heading</option>
            {headings.map((heading) => (
              <option key={heading.id} value={heading.id}>
                {heading.title}
              </option>
            ))}
          </select>
          <Button onClick={addTask}>
            <Plus size={16} /> Add
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
          <Input
            value={headingDraft}
            placeholder="New heading (e.g. Study, Errands)"
            onChange={(event) => setHeadingDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addHeading()}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={addHeading}>
            <Plus size={15} /> Heading
          </Button>
        </div>
      </div>

      {headings.map((heading) => renderGroup(heading.id, heading.title))}
      {renderGroup(null, headings.length ? "Unsorted" : undefined)}
    </div>
  );
}
