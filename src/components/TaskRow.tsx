import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { addDays } from "../domain/dates";
import type { Task } from "../domain/model";
import {
  resolveSwipe,
  rubberBand,
  SWIPE_COMMIT_PX,
  SWIPE_MAX_PX,
  type SwipeState,
} from "../domain/swipe";
import { MOTION_MS, usePresence } from "../lib/motion";
import { subtaskProgress } from "../domain/tasks";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { TaskCheck } from "./TaskMark";

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
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [swipe, setSwipe] = useState<SwipeState>(REST);
  /** Raw, rubber-banded offset of the finger while dragging. */
  const [rubber, setRubber] = useState(0);
  const [dragging, setDragging] = useState(false);
  const shown = usePresence(menu, MOTION_MS.fast);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  /** The gesture moved the row sideways, so the click it may end with is not a tap. */
  const swiped = useRef(false);

  // The menu is portalled to <body>: the row keeps a translate transform for swipes,
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

  function undo(message: string) {
    notify(message, "success", {
      label: "Undo",
      run: actions.undoTaskChange,
      durationMs: 5000,
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    swiped.current = false;
    if (e.pointerType === "mouse") return;
    // The portalled "..." menu bubbles its events here through React: not part of the row.
    if (!e.currentTarget.contains(e.target as Node)) return;
    // A swipe may start anywhere else, including on the title: it fills most of the row.
    if ((e.target as Element).closest("input,textarea,select")) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setRubber(0);
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
    // No pointer capture yet: a plain tap must still reach the button under the finger.
  }

  function cancelSwipe() {
    start.current = null;
    axis.current = null;
    setDragging(false);
    setRubber(0);
    setSwipe(REST);
  }

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
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
      setRubber(0);
      setSwipe(REST);
      return;
    }
    if (next.axis === "x") {
      e.preventDefault(); // native horizontal scroll is already blocked by touch-pan-y
      axis.current = next.axis;
      swiped.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // 1:1 until the limit, then resistance; the commit still uses the resolver.
    setRubber(rubberBand(e.clientX - from.x));
    setSwipe(next);
  }

  function endSwipe(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const from = start.current;
    const locked = axis.current;
    start.current = null;
    axis.current = null;
    setDragging(false);
    setRubber(0);
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
      undo("Task deleted");
    } else if (resolved.action === "archive") {
      actions.archiveTask(task.id);
      undo("Task archived");
    }
  }

  const displayDx = dragging ? rubber : swipe.dx;
  const underlayWidth = Math.min(Math.abs(displayDx), SWIPE_MAX_PX);
  const underlayOpacity = Math.min(1, Math.abs(displayDx) / SWIPE_COMMIT_PX);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onClickCapture={onClickCapture}
      className={`group relative flex min-h-11 touch-pan-y items-center overflow-hidden ${
        active ? "bg-ink/[0.07]" : ""
      }`}
    >
      {/* Swipe right: Archive. Text only, no coloured slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 flex items-center overflow-hidden"
        style={{ width: swipe.dx > 0 ? underlayWidth : 0, opacity: swipe.dx > 0 ? underlayOpacity : 0 }}
      >
        <span className="shrink-0 px-3 text-[12px] text-muted">Archive</span>
      </div>
      {/* Swipe left: Delete. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0 flex items-center justify-end overflow-hidden"
        style={{ width: swipe.dx < 0 ? underlayWidth : 0, opacity: swipe.dx < 0 ? underlayOpacity : 0 }}
      >
        <span className="shrink-0 px-3 text-[12px] text-rose">Delete</span>
      </div>
      <div
        className="relative z-10 flex w-full min-w-0 flex-1 items-center gap-1.5"
        style={{
          transform: `translateX(${displayDx}px)`,
          transition: dragging ? "none" : "transform var(--motion) var(--ease-spring)",
        }}
      >
        <TaskCheck
          checked={task.done}
          color={color}
          onToggle={() => actions.toggleTask(task.id)}
          label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
        />
        <button
          onClick={() => onOpen(task.id)}
          className="day-press flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="min-w-0 flex-1 truncate text-[14.5px] leading-snug">
            <span className="day-title-wrap">
              <span className={`task-title ${task.done ? "done" : ""}`}>{task.title}</span>
              <span aria-hidden className={`day-strike ${task.done ? "on" : ""}`} />
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-faint">
            {task.time && <span className="tabular-nums">{task.time}</span>}
            {progress.total > 0 && (
              <span className="tabular-nums">
                {progress.done}/{progress.total}
              </span>
            )}
            {task.deadline && <span className="text-amber">due</span>}
          </span>
        </button>
        <button
          ref={menuButton}
          onClick={() => setMenu((v) => !v)}
          onKeyDown={onMenuKeyDown}
          aria-label={`More options for ${task.title}`}
          aria-expanded={menu}
          aria-haspopup="menu"
          className={`day-press flex h-11 w-11 shrink-0 items-center justify-center text-faint transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent ${
            menu ? "text-ink" : ""
          }`}
        >
          <MoreHorizontal size={18} />
        </button>
        {shown.mounted &&
          createPortal(
            <>
              <button
                aria-label="Close menu"
                className={`day-backdrop fixed inset-0 z-10 cursor-default ${shown.closing ? "closing" : ""}`}
                onClick={() => setMenu(false)}
                onKeyDown={onMenuKeyDown}
              />
              <div
                ref={popover}
                role="menu"
                onKeyDown={onMenuKeyDown}
                style={{ top: popoverPos.top, left: popoverPos.left }}
                className={`day-pop fixed z-20 w-48 origin-top-right overflow-hidden border border-line bg-[var(--pop)] py-1 ${
                  shown.closing ? "closing" : ""
                }`}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    actions.moveTaskToDay(task.id, addDays(task.date, 1));
                    setMenu(false);
                  }}
                  className="day-press flex min-h-11 w-full items-center px-3 text-left text-[13px] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Move to tomorrow
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    actions.archiveTask(task.id);
                    undo("Task archived");
                    setMenu(false);
                  }}
                  className="day-press flex min-h-11 w-full items-center px-3 text-left text-[13px] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Archive
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    actions.deleteTask(task.id);
                    undo("Task deleted");
                    setMenu(false);
                  }}
                  className="day-press flex min-h-11 w-full items-center px-3 text-left text-[13px] text-rose focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Delete
                </button>
              </div>
            </>,
            document.body,
          )}
      </div>
    </div>
  );
}
