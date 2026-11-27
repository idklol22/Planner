import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<Variant, string> = {
  primary:
    "primary-button text-ink shadow-lg shadow-accent/20 hover:brightness-110",
  secondary:
    "border border-line-2 bg-ink/[0.035] text-ink hover:border-ink/20 hover:bg-ink/[0.07]",
  ghost: "text-muted hover:bg-ink/[0.06] hover:text-ink",
  danger:
    "border border-rose/20 bg-rose/10 text-rose hover:bg-rose/20",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${buttonStyles[variant]} ${className}`} {...props} />;
}

export function IconButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-ink/[0.07] hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`inset-field w-full bg-transparent px-3 py-2 text-[16px] text-ink placeholder:text-faint focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={`panel glass-panel p-5 ${className}`}>{children}</section>;
}

export function Chip({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: "slate" | "accent" | "amber" | "mint" | "rose";
  className?: string;
}) {
  const tones = {
    slate: "bg-ink/[0.05] text-muted ring-ink/10",
    accent: "bg-accent/15 text-accent ring-accent/25",
    amber: "bg-amber/15 text-amber ring-amber/25",
    mint: "bg-mint/15 text-mint ring-mint/25",
    rose: "bg-rose/15 text-rose ring-rose/25",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  eyebrow,
  children,
  action,
}: {
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            {eyebrow}
          </div>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-ink">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export function Empty({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink/[0.09] px-4 py-9 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="text-sm font-medium text-muted">{title}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function ProgressRing({
  value,
  max,
  size = 92,
  stroke = 8,
  color = "var(--color-accent)",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas/20 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === option.value
              ? "bg-ink/10 text-ink shadow-sm"
              : "text-faint hover:text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
