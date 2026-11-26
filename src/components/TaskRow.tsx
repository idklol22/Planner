import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  Clock,
  Flag,
  ListChecks,
  MoreHorizontal,
  Repeat,
  StickyNote,
  Trash2,
} from "lucide-react";
import { addDays } from "../domain/dates";
import type { Task } from "../domain/model";
import { resolveSwipe, type SwipeState } from "../domain/swipe";
import { subtaskProgress } from "../domain/tasks";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { FlowerCheck } from "./Flower";
import { CalendarArrowRight } from "./icons";

const REST: SwipeState = { axis: null, dx: 0, action: null, settled: false };

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
  const notify = useToast();
  const progress = subtaskProgress(data.tasks, task.id);
  const hasNote = !!task.note?.content.trim();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [swipe, setSwipe] = useState<SwipeState>(REST);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);

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

  function undo() {
    notify("Change undone", "success", {
      label: "Undo",
      run: actions.undoTaskChange,
      durationMs: 5000,
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    // Checkbox, title and "..." buttons keep their taps: never start a gesture on a control.
    if ((e.target as Element).closest("button,input,textarea,select,a")) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setSwipe(
      resolveSwipe({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        axis: null,
        pointerDown: true,
      }),
    );
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    const from = start.current;
    if (!from) return;
    const next = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: axis.current,
      pointerDown: true,
    });
    if (next.axis === "y") {
      // Vertical scroll wins: let the browser take the gesture back over.
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      start.current = null;
      setDragging(false);
      setSwipe(REST);
      return;
    }
    if (next.axis === "x") {
      e.preventDefault(); // native horizontal scroll is already blocked by touch-pan-y
      axis.current = next.axis;
    }
    setSwipe(next);
  }

  function endSwipe(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const from = start.current;
    const locked = axis.current;
    start.current = null;
    axis.current = null;
    setDragging(false);
    setSwipe(REST);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const resolved = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: locked,
      pointerDown: false,
    });
    if (resolved.action === "delete") {
      actions.deleteTask(task.id);
      notify("Task deleted", "success", {
        label: "Undo",
        run: actions.undoTaskChange,
        durationMs: 5000,
      });
    } else if (resolved.action === "archive") {
      actions.archiveTask(task.id);
      notify("Task archived", "success", {
        label: "Undo",
        run: actions.undoTaskChange,
        durationMs: 5000,
      });
    }
  }

  const underlayWidth = Math.min(Math.abs(swipe.dx), 120);
  const underlayOpacity = Math.min(1, Math.abs(swipe.dx) / 96);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
      className={`group relative flex min-h-[52px] touch-pan-y items-center gap-3.5 overflow-hidden rounded-xl px-2 py-1 transition-colors ${
        active ? "bg-ink/[0.07]" : "hover:bg-ink/[0.04]"
      }`}
    >
      {/* Left underlay: revealed by a swipe right = Archive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 flex items-center justify-start overflow-hidden rounded-xl bg-accent text-accent-ink"
        style={{ width: swipe.dx > 0 ? underlayWidth : 0, opacity: swipe.dx > 0 ? underlayOpacity : 0 }}
      >
        <span className="flex shrink-0 items-center gap-1.5 px-3 text-[13px] font-semibold">
          <Archive size={18} /> Archive
        </span>
      </div>
      {/* Right underlay: revealed by a swipe left = Delete. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0 flex items-center justify-end overflow-hidden rounded-xl bg-rose/15 text-rose"
        style={{ width: swipe.dx < 0 ? underlayWidth : 0, opacity: swipe.dx < 0 ? underlayOpacity : 0 }}
      >
        <span className="flex shrink-0 items-center gap-1.5 px-3 text-[13px] font-semibold">
          <Trash2 size={18} /> Delete
        </span>
      </div>
      <div
        className="relative z-10 flex w-full min-w-0 flex-1 items-center gap-3.5"
        style={{
          transform: `translateX(${swipe.dx}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
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
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-accent"
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
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <CalendarArrowRight size={16} className="text-muted" /> Move to tomorrow
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    actions.archiveTask(task.id);
                    undo();
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Archive size={16} className="text-muted" /> Archive
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    actions.deleteTask(task.id);
                    undo();
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-rose hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </>,
            document.body,
          )}
      </div>
    </div>
  );
}
