import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Link2,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Task } from "../domain/model";
import { useStore } from "../state/store";
import { Chip, IconButton } from "./ui";

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

  const status = task.note?.handoff.status;
  const subjects = data.settings.learnharnessSubjects;

  return (
    <div
      className={`group relative rounded-xl border px-3 py-2.5 transition-all duration-200 ${
        selected
          ? "border-accent/50 bg-accent/[0.09] shadow-[0_0_0_1px_rgba(139,124,255,0.15)]"
          : "border-line bg-white/[0.018] hover:border-line-2 hover:bg-white/[0.035]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => actions.toggleTask(task.id)}
          className="mt-[3px] h-[17px] w-[17px] shrink-0 cursor-pointer rounded accent-accent"
          aria-label={`Mark ${task.title} done`}
        />

        <div className="min-w-0 flex-1">
          <input
            value={task.title}
            onChange={(event) => actions.updateTask(task.id, { title: event.target.value })}
            className={`w-full bg-transparent text-[13.5px] font-medium outline-none ${
              task.done ? "text-faint line-through" : "text-ink"
            }`}
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.tags.map((tag) => (
              <Chip
                key={tag}
                tone={tag === "persistent" ? "amber" : tag === "today" ? "accent" : "slate"}
              >
                {tag}
                <button
                  onClick={() => actions.removeTag(task.id, tag)}
                  className="ml-0.5 opacity-50 hover:opacity-100"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={10} />
                </button>
              </Chip>
            ))}

            {task.linkedSubjectId && (
              <Chip tone="accent">
                <Link2 size={10} /> {task.linkedSubjectId}
              </Chip>
            )}
            {status === "ready" && <Chip tone="amber">ready for LH</Chip>}
            {status === "sent" && <Chip tone="mint">sent</Chip>}
            {status === "failed" && <Chip tone="rose">failed</Chip>}

            {addingTag ? (
              <input
                autoFocus
                value={tagValue}
                placeholder="tag ↵"
                onChange={(event) => setTagValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    actions.addTag(task.id, tagValue);
                    setTagValue("");
                    setAddingTag(false);
                  }
                  if (event.key === "Escape") setAddingTag(false);
                }}
                className="inset-field w-24 px-2 py-0.5 text-[11px] text-ink placeholder:text-faint focus:outline-none"
              />
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] text-faint transition-colors hover:bg-white/5 hover:text-muted"
                title="Add tag"
              >
                <Plus size={11} /> tag
              </button>
            )}
          </div>

          {subjects.length > 0 && (
            <select
              value={task.linkedSubjectId ?? ""}
              onChange={(event) => actions.linkSubject(task.id, event.target.value || null)}
              className="mt-2 rounded-lg border border-line bg-black/25 px-2 py-1 text-[10.5px] text-muted outline-none transition-colors hover:border-line-2 focus:border-accent/50"
            >
              <option value="">Link a LearnHarness subject…</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton onClick={() => actions.moveTask(task.id, -1)} title="Move up" className="h-7 w-7">
            <ArrowUp size={14} />
          </IconButton>
          <IconButton onClick={() => actions.moveTask(task.id, 1)} title="Move down" className="h-7 w-7">
            <ArrowDown size={14} />
          </IconButton>
          <IconButton
            onClick={() => {
              actions.ensureNote(task.id);
              onSelect();
            }}
            title="Open notes"
            className={`relative h-7 w-7 ${task.note ? "text-accent" : ""}`}
          >
            {status === "sent" ? <Send size={14} /> : <FileText size={14} />}
            {task.note && (
              <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-accent" />
            )}
          </IconButton>
          <IconButton
            onClick={() => actions.deleteTask(task.id)}
            title="Delete task"
            className="h-7 w-7 hover:text-rose"
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
