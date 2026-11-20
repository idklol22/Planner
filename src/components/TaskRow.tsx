import { Clock, Flag, ListChecks, Repeat, StickyNote } from "lucide-react";
import type { Task } from "../domain/model";
import { subtaskProgress } from "../domain/tasks";
import { useStore } from "../state/store";
import { FlowerCheck } from "./Flower";

export function TaskRow({
  task,
  color,
  active,
  onOpen,
}: {
  task: Task;
  color: string;
  active?: boolean;
  onOpen: (id: string) => void;
}) {
  const { data, actions } = useStore();
  const progress = subtaskProgress(data.tasks, task.id);
  const hasNote = !!task.note?.content.trim();

  return (
    <div
      className={`animate-row group flex min-h-[48px] items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors ${
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <FlowerCheck
        checked={task.done}
        color={color}
        onToggle={() => actions.toggleTask(task.id)}
        label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
        size={30}
      />
      <button
        onClick={() => onOpen(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <span
          className={`min-w-0 flex-1 truncate text-[17px] leading-snug transition-colors ${
            task.done ? "text-faint line-through decoration-white/30" : "text-ink"
          }`}
        >
          {task.title}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-faint">
          {task.seriesId || task.rrule ? <Repeat size={14} aria-label="Repeats" /> : null}
          {hasNote && <StickyNote size={14} aria-label="Has a note" />}
          {task.time && (
            <span className="flex items-center gap-1 text-[12px] font-medium tabular-nums">
              <Clock size={13} /> {task.time}
            </span>
          )}
          {task.deadline && <Flag size={14} className="text-rose" aria-label="Deadline" />}
          {progress.total > 0 && (
            <span className="flex items-center gap-1 text-[12px] font-medium tabular-nums">
              <ListChecks size={14} /> {progress.done}/{progress.total}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
