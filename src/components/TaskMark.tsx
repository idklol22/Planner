/** Planner's completion mark: a tile that fills from the bottom, then a pen tick that runs past its edge.
 *  The calendar uses the same tiles (see Calendar.tsx), so "a filled tile" always means "done". */
export interface TaskMarkProps {
  /** Category colour. */
  color?: string;
  done?: boolean;
  size?: number;
  className?: string;
  /** Dashed outline: a habit suggestion that is not a task yet. */
  ghost?: boolean;
}

export function TaskMark({ color = "var(--accent)", done = false, size = 22, className, ghost = false }: TaskMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`task-mark ${done ? "on" : ""} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      {!ghost && <rect className="task-mark-fill" x="3.5" y="3.5" width="17" height="17" rx="5.5" fill={color} />}
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="5.5"
        fill={ghost || done ? "none" : color}
        fillOpacity={0.1}
        stroke={color}
        strokeWidth={1.7}
        strokeDasharray={ghost ? "3 3" : undefined}
      />
      {/* The wider background-coloured stroke keeps the tick crisp both on and off the tile. */}
      <path className="task-mark-tick under" d="M7 12.6 L10.8 16.4 L21.6 4" />
      <path className="task-mark-tick" d="M7 12.6 L10.8 16.4 L21.6 4" />
    </svg>
  );
}

/** The task checkbox: a TaskMark inside a comfortable touch target. */
export function TaskCheck({
  checked,
  color,
  onToggle,
  size = 22,
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
