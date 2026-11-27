import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Text-only variants: no filled pills, borders or shadows. Colour is used for meaning only.
const buttonStyles: Record<Variant, string> = {
  primary: "font-semibold text-accent",
  secondary: "text-ink",
  ghost: "text-muted",
  danger: "text-rose",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 px-2 text-[14px] transition-opacity active:opacity-70 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4";

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
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center text-faint transition-opacity hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:underline ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border-b border-line bg-transparent px-1 py-2 text-[16px] text-ink placeholder:text-faint focus:outline-none ${className}`}
      {...props}
    />
  );
}

/** A plain grouping element — spacing and hairlines come from the caller, not from a card. */
export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={className}>{children}</section>;
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
    slate: "text-muted",
    accent: "text-accent",
    amber: "text-amber",
    mint: "text-mint",
    rose: "text-rose",
  };
  return <span className={`inline-flex items-center gap-1 text-[12px] ${tones[tone]} ${className}`}>{children}</span>;
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
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{eyebrow}</div>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{children}</h2>
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
    <div className="flex flex-col items-center justify-center px-4 py-9 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="text-[14px] font-medium text-muted">{title}</div>
      {hint && <div className="mt-1 text-[12px] text-faint">{hint}</div>}
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
    <div className="inline-flex gap-3">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 px-1 text-[12px] font-medium transition-colors ${
            value === option.value
              ? "text-ink underline underline-offset-4"
              : "text-faint hover:text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
