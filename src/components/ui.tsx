import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "default" | "ghost" | "outline" | "danger";

const buttonVariants: Record<Variant, string> = {
  default: "bg-indigo-500 text-white hover:bg-indigo-400",
  ghost: "text-slate-300 hover:bg-white/10",
  outline: "border border-white/15 text-slate-200 hover:bg-white/5",
  danger: "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400/60 ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-xl shadow-black/20 ${className}`}
    >
      {children}
    </section>
  );
}

export function Chip({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: "slate" | "indigo" | "emerald" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    slate: "bg-white/5 text-slate-300 ring-white/10",
    indigo: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/20",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-400/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
