import { CalendarDays, Flame, Repeat, Settings2, CheckSquare } from "lucide-react";
import { todayISO } from "../domain/dates";
import { useStore } from "../state/store";

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
  isNative,
}: {
  view: View;
  onViewChange: (view: View) => void;
  isNative: boolean;
}) {
  const { data } = useStore();
  const today = todayISO();
  const todayTasks = data.tasks.filter((task) => task.date === today);
  const done = todayTasks.filter((task) => task.done).length;
  const ready = todayTasks.filter(
    (task) => task.note?.handoff.status === "ready",
  ).length;
  const kcal = data.calories
    .filter((entry) => entry.date === today)
    .reduce((sum, entry) => sum + entry.kcal, 0);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-slate-900/40 p-4">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
            <CheckSquare size={20} />
          </div>
          <div>
            <div className="text-base font-semibold text-white">ToDoMate</div>
            <div className="text-[11px] text-slate-500">
              {isNative ? "Desktop app" : "Browser dev mode"}
            </div>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-500/15 text-indigo-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
        <div className="mb-3 font-semibold text-slate-200">Today</div>
        <div className="flex justify-between py-1">
          <span>Tasks done</span>
          <span className="text-slate-200">
            {done}/{todayTasks.length}
          </span>
        </div>
        <div className="flex justify-between py-1">
          <span>Ready for LH</span>
          <span className="text-amber-300">{ready}</span>
        </div>
        <div className="flex justify-between py-1">
          <span>Calories</span>
          <span className="text-slate-200">{kcal} kcal</span>
        </div>
      </div>
    </aside>
  );
}
