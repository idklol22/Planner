import {
  CalendarDays,
  CheckSquare,
  CircleDot,
  Flame,
  HardDrive,
  Repeat,
  Settings2,
  Sparkles,
} from "lucide-react";
import { todayISO } from "../domain/dates";
import { useStore } from "../state/store";
import { ProgressRing } from "./ui";

export type View = "calendar" | "habits" | "calories" | "settings";

const items: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: "calendar", label: "Calendar & Tasks", icon: CalendarDays },
  { id: "habits", label: "Habits", icon: Repeat },
  { id: "calories", label: "Calories", icon: Flame },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function Sidebar({
  view,
  onViewChange,
}: {
  view: View;
  onViewChange: (view: View) => void;
}) {
  const { data, isNative } = useStore();
  const today = todayISO();
  const todayTasks = data.tasks.filter(
    (task) => task.date === today || task.tags.includes("persistent"),
  );
  const done = todayTasks.filter((task) => task.done).length;
  const ready = todayTasks.filter((task) => task.note?.handoff.status === "ready").length;
  const kcal = data.calories
    .filter((entry) => entry.date === today)
    .reduce((sum, entry) => sum + entry.kcal, 0);

  const counts: Record<View, number | null> = {
    calendar: todayTasks.length || null,
    habits: data.habits.length || null,
    calories: null,
    settings: null,
  };

  return (
    <aside className="flex w-[252px] shrink-0 flex-col border-r border-line bg-rail px-3.5 py-5">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-white">
          <CheckSquare size={19} strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-ink">
            todo<span className="gradient-text">mate</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
            Daily companion
          </div>
        </div>
      </div>

      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        Workspace
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                active
                  ? "nav-active text-ink"
                  : "text-muted hover:bg-white/[0.035] hover:text-ink"
              }`}
            >
              <Icon
                size={17}
                className={active ? "text-accent" : "text-faint group-hover:text-muted"}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {counts[item.id] !== null && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-accent/15 text-[#bdb3ff]" : "bg-white/5 text-faint"
                  }`}
                >
                  {counts[item.id]}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 px-1">
        <div className="panel-soft p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            <Sparkles size={12} className="text-accent" /> Today&apos;s focus
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing value={done} max={Math.max(1, todayTasks.length)} size={76} stroke={7}>
              <span className="text-lg font-semibold text-ink">
                {todayTasks.length ? Math.round((done / todayTasks.length) * 100) : 0}%
              </span>
            </ProgressRing>
            <div className="min-w-0 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2 text-muted">
                <CircleDot size={12} className="text-accent" />
                {done}/{todayTasks.length} tasks
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Sparkles size={12} className="text-amber" />
                {ready} ready for LH
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Flame size={12} className="text-rose" />
                {kcal} kcal
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto px-2 pt-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
          <HardDrive size={14} className="text-faint" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-muted">Local workspace</div>
            <div className="text-[10px] text-faint">
              {isNative ? "Desktop · files on disk" : "Browser dev · localStorage"}
            </div>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_8px_var(--color-mint)]" />
        </div>
      </div>
    </aside>
  );
}
