/** Planner's completion mark: a plain circle. Open = faint outline, done = muted
 *  disk with a small tick cut out of it. The calendar uses the same mark, so
 *  "a filled circle" always means "done". The category colour is deliberately
 *  ignored: only a tiny dot beside the category name carries colour. */
export interface TaskMarkProps {
  /** Accepted for compatibility with existing callers; no longer used. */
  color?: string;
  done?: boolean;
  size?: number;
  className?: string;
  /** Dashed outline: a habit suggestion that is not a task yet. */
  ghost?: boolean;
}

const RING = { cx: 12, cy: 12, r: 11.25 };
const TICK = "M7.5 12.2 L10.5 15.2 L16.5 9.2";

export function TaskMark({ done = false, size = 18, className, ghost = false }: TaskMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`task-mark ${done ? "on" : ""} ${ghost ? "ghost" : ""} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      {!ghost && <circle className="task-mark-disk" {...RING} fill="var(--color-muted)" />}
      <circle
        className="task-mark-ring"
        {...RING}
        fill="none"
        stroke="var(--color-faint)"
        strokeWidth={1.5}
        strokeDasharray={ghost ? "3 3" : undefined}
      />
      <path className="task-mark-tick" d={TICK} stroke="var(--color-canvas)" strokeWidth={2} />
    </svg>
  );
}

/** The task checkbox: a TaskMark inside a comfortable touch target. */
export function TaskCheck({
  checked,
  color,
  onToggle,
  size = 18,
  label,
}: {
  checked: boolean;
  color: string;
  onToggle: () => void;
  size?: number;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "Toggle done"}
      className="mark-btn"
      onClick={(event) => {
        event.stopPropagation();
        if (!checked) navigator.vibrate?.(8);
        onToggle();
      }}
    >
      <TaskMark color={color} done={checked} size={size} />
    </button>
  );
}
