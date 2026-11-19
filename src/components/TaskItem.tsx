import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Task } from "../domain/model";
import { useStore } from "../state/store";
import { Chip, IconButton, Input } from "./ui";

export function TaskItem({
  task,
  selected,
  onSelect,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
}) {
  const { data, actions } = useStore();
  const [addingTag, setAddingTag] = useState(false);
  const [tagValue, setTagValue] = useState("");

  const status = task.note?.handoff;
  const subjects = data.settings.learnharnessSubjects;

  return (
    <div
      className={`group rounded-xl border px-3 py-2.5 transition-colors ${
        selected
          ? "border-indigo-400/50 bg-indigo-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => actions.toggleTask(task.id)}
          className="mt-1 h-4 w-4 shrink-0 accent-indigo-500"
          aria-label={`Mark ${task.title} done`}
        />

        <div className="min-w-0 flex-1">
          <input
            value={task.title}
            onChange={(event) => actions.updateTask(task.id, { title: event.target.value })}
            className={`w-full bg-transparent text-sm outline-none ${
              task.done ? "text-slate-500 line-through" : "text-slate-100"
            }`}
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.tags.map((tag) => (
              <Chip
                key={tag}
                tone={tag === "persistent" ? "amber" : tag === "today" ? "indigo" : "slate"}
              >
                {tag}
                <button
                  onClick={() => actions.removeTag(task.id, tag)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={11} />
                </button>
              </Chip>
            ))}

            {status?.status === "ready" && <Chip tone="amber">ready for LH</Chip>}
            {status?.status === "sent" && <Chip tone="emerald">sent to LH</Chip>}
            {status?.status === "failed" && <Chip tone="rose">handoff failed</Chip>}

            {addingTag ? (
              <Input
                autoFocus
                value={tagValue}
                placeholder="tag + Enter"
                onChange={(event) => setTagValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    actions.addTag(task.id, tagValue);
                    setTagValue("");
                    setAddingTag(false);
                  }
                  if (event.key === "Escape") setAddingTag(false);
                }}
                className="w-28 px-2 py-0.5 text-xs"
              />
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white/10 hover:text-slate-300"
                title="Add tag"
              >
                <Plus size={12} /> tag
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <IconButton onClick={() => actions.moveTask(task.id, -1)} title="Move up">
            <ArrowUp size={15} />
          </IconButton>
          <IconButton onClick={() => actions.moveTask(task.id, 1)} title="Move down">
            <ArrowDown size={15} />
          </IconButton>
          <IconButton
            onClick={() => {
              actions.ensureNote(task.id);
              onSelect();
            }}
            title="Open notes"
            className={task.note ? "text-indigo-300" : ""}
          >
            {status?.status === "sent" ? <Send size={15} /> : <FileText size={15} />}
          </IconButton>
          <IconButton
            onClick={() => actions.deleteTask(task.id)}
            title="Delete task"
            className="hover:text-rose-300"
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      {subjects.length > 0 && (
        <div className="mt-2 pl-6">
          <select
            value={task.linkedSubjectId ?? ""}
            onChange={(event) =>
              actions.linkSubject(task.id, event.target.value || null)
            }
            className="rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none"
          >
            <option value="">No LearnHarness subject</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
