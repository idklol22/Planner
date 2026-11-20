import { useRef, useState } from "react";

const GREY = "var(--flower-grey)";
const CIRCLES: ReadonlyArray<readonly [number, number, number]> = [
  [14.5, 14.5, 9.5],
  [25.5, 14.5, 9.5],
  [14.5, 25.5, 9.5],
  [25.5, 25.5, 9.5],
  [20, 20, 8.5],
];

export interface FlowerProps {
  /** Category colour, used when `filled`. */
  color?: string;
  filled?: boolean;
  /** Shown inside an unfilled blob (open-task count). */
  count?: number;
  /** Draws a white check (and is normally combined with `filled`). */
  checked?: boolean;
  size?: number;
  className?: string;
  /** Faded dashed outline: a habit suggestion that is not a task yet. */
  ghost?: boolean;
}

/** One SVG for both the task checkbox and the calendar blob:
 *  four overlapping circles, grey or filled in a category colour. */
export function Flower({
  color = "#fff",
  filled = false,
  count,
  checked = false,
  size = 28,
  className,
  ghost = false,
}: FlowerProps) {
  const showCount = !checked && count !== undefined && count > 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        className="flower-fill"
        fill={ghost ? "none" : filled ? color : GREY}
        fillOpacity={filled && !ghost ? 0.92 : 1}
        stroke={ghost ? color : undefined}
        strokeWidth={ghost ? 1.6 : undefined}
        strokeDasharray={ghost ? "3.5 3.5" : undefined}
      >
        {CIRCLES.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} style={{ transition: "fill .22s ease" }} />
        ))}
      </g>
      <path
        d="M12.5 20.5 L18 26 L28 14.5"
        fill="none"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`flower-check ${checked ? "on" : ""}`}
      />
      {showCount && (
        <text
          x="20"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text)"
          fontSize={count! > 9 ? 15 : 17}
          fontWeight={600}
          fontFamily="inherit"
        >
          {count}
        </text>
      )}
    </svg>
  );
}

/** The task checkbox: a Flower inside a button with a small pop on toggle. */
export function FlowerCheck({
  checked,
  color,
  onToggle,
  size = 28,
  label,
}: {
  checked: boolean;
  color: string;
  onToggle: () => void;
  size?: number;
  label?: string;
}) {
  const [pop, setPop] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "Toggle done"}
      className={`flower-btn ${pop ? "pop" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!checked) {
          setPop(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setPop(false), 450);
          navigator.vibrate?.(8);
        }
        onToggle();
      }}
    >
      <Flower color={color} filled={checked} checked={checked} size={size} />
    </button>
  );
}
