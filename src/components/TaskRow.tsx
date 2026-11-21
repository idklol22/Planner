import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Clock, Flag, ListChecks, MoreHorizontal, Repeat, StickyNote } from "lucide-react";
import { addDays } from "../domain/dates";
import type { Task } from "../domain/model";
import { subtaskProgress } from "../domain/tasks";
import { useStore } from "../state/store";
import { FlowerCheck } from "./Flower";
import { CalendarArrowRight } from "./icons";

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
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  // The menu is portalled to <body>: `animate-row` leaves a permanent transform on the row,
  // which would size the fixed catcher to the row, trap the popover in the row's stacking
  // context, and let `main`'s overflow clip it. Measure the real popover before paint so the
  // right-aligned position is exact and it flips above the button when there's no room below.
  useLayoutEffect(() => {
    if (!menu) return;
    const rect = menuButton.current?.getBoundingClientRect();
    const el = popover.current;
    if (!rect || !el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const gap = 4;
    const edge = 8;
    const left = Math.max(edge, Math.min(rect.right - width, window.innerWidth - width - edge));
    const below = rect.bottom + gap;
    const top = below + height + edge <= window.innerHeight ? below : Math.max(edge, rect.top - gap - height);
    setPopoverPos({ top, left });
  }, [menu]);

  function onMenuKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape") {
      setMenu(false);
      menuButton.current?.focus();
    }
  }

  return (
    <div
      className={`animate-row group relative flex min-h-[52px] items-center gap-3.5 rounded-xl px-2 py-1 transition-colors ${
        active ? "bg-ink/[0.07]" : "hover:bg-ink/[0.04]"
      }`}
    >
      <FlowerCheck
        checked={task.done}
        color={color}
        onToggle={() => actions.toggleTask(task.id)}
        label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
        size={32}
      />
      <button
        onClick={() => onOpen(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <span
          className={`min-w-0 flex-1 truncate text-[17px] leading-snug transition-colors ${
            task.done ? "text-faint line-through decoration-ink/25" : "text-ink"
          }`}
        >
          {task.title}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-faint">
          {task.seriesId || task.rrule ? <Repeat size={16} aria-label="Repeats" /> : null}
          {hasNote && <StickyNote size={16} aria-label="Has a note" />}
          {task.time && (
            <span className="flex items-center gap-1 text-[13px] font-medium tabular-nums">
              <Clock size={14} /> {task.time}
            </span>
          )}
          {task.deadline && <Flag size={14} className="text-rose" aria-label="Deadline" />}
          {progress.total > 0 && (
            <span className="flex items-center gap-1 text-[13px] font-medium tabular-nums">
              <ListChecks size={15} /> {progress.done}/{progress.total}
            </span>
          )}
        </span>
      </button>
      <button
        ref={menuButton}
        onClick={() => setMenu((v) => !v)}
        onKeyDown={onMenuKeyDown}
        aria-label={`More options for ${task.title}`}
        aria-expanded={menu}
        aria-haspopup="menu"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-ink/[0.08] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent ${
          menu ? "bg-ink/[0.08]" : ""
        }`}
      >
        <MoreHorizontal size={18} />
      </button>
      {menu &&
        createPortal(
          <>
            <button
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenu(false)}
              onKeyDown={onMenuKeyDown}
            />
            <div
              ref={popover}
              role="menu"
              onKeyDown={onMenuKeyDown}
              style={{ top: popoverPos.top, left: popoverPos.left }}
              className="animate-pop fixed z-20 w-52 origin-top-right overflow-hidden rounded-2xl border border-line-2 bg-[var(--pop)] p-1 shadow-2xl shadow-black"
            >
              <button
                role="menuitem"
                onClick={() => {
                  actions.moveTaskToDay(task.id, addDays(task.date, 1));
                  setMenu(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium hover:bg-ink/5"
              >
                <CalendarArrowRight size={16} className="text-muted" /> Move to tomorrow
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
