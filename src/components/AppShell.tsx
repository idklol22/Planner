import { useState } from "react";
import { CalendarPlus, ChevronRight, Command } from "lucide-react";
import { Sidebar, type View } from "./Sidebar";
import { CalendarView } from "./CalendarView";
import { HabitsView } from "./HabitsView";
import { CaloriesView } from "./CaloriesView";
import { SettingsView } from "./SettingsView";
import { NotesEditor } from "./NotesEditor";
import { formatDay, todayISO, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import { Button } from "./ui";

const viewMeta: Record<View, { title: string; subtitle: string }> = {
  calendar: { title: "Calendar & Tasks", subtitle: "Plan your days, one at a time" },
  habits: { title: "Habits", subtitle: "Small repeats, compounding over time" },
  calories: { title: "Calories", subtitle: "Three mindful check-ins a day" },
  settings: { title: "Settings", subtitle: "Shape the app around your workflow" },
};

export function AppShell() {
  const { data, ready } = useStore();
  const [view, setView] = useState<View>("calendar");
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayISO());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const meta = viewMeta[view];

  if (!ready) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <div className="brand-mark h-10 w-10 animate-pulse rounded-xl" />
        <span className="text-sm text-muted">Waking up ToDoMate…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar view={view} onViewChange={setView} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[70px] shrink-0 items-center justify-between gap-4 border-b border-line bg-rail/60 px-6 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-faint sm:flex">
              <span>Workspace</span>
              <ChevronRight size={13} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight text-ink">{meta.title}</h1>
              <p className="text-[11px] text-faint">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-3 py-1.5 text-xs text-muted md:flex">
              <Command size={13} className="text-faint" />
              <span>{formatDay(todayISO())}</span>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setSelectedDate(todayISO());
                setView("calendar");
              }}
            >
              <CalendarPlus size={16} />
              <span className="hidden sm:inline">New task</span>
            </Button>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(139,124,255,0.09),transparent_65%)]" />
          <div className="relative mx-auto max-w-[1440px] p-6 lg:p-8">
            <div key={view} className="animate-rise">
              {view === "calendar" && (
                <CalendarView
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={setSelectedTaskId}
                />
              )}
              {view === "habits" && (
                <HabitsView date={selectedDate} onDateChange={setSelectedDate} />
              )}
              {view === "calories" && (
                <CaloriesView date={selectedDate} onDateChange={setSelectedDate} />
              )}
              {view === "settings" && <SettingsView />}
            </div>
          </div>
        </main>
      </div>

      {selectedTask && (
        <NotesEditor task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      )}
    </div>
  );
}
