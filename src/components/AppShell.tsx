import { useState } from "react";
import { Sidebar, type View } from "./Sidebar";
import { CalendarView } from "./CalendarView";
import { HabitsView } from "./HabitsView";
import { CaloriesView } from "./CaloriesView";
import { SettingsView } from "./SettingsView";
import { NotesEditor } from "./NotesEditor";
import { todayISO, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";

export function AppShell() {
  const { data, ready, isNative } = useStore();
  const [view, setView] = useState<View>("calendar");
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayISO());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null;

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading ToDoMate…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200">
      <Sidebar view={view} onViewChange={setView} isNative={isNative} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
          {view === "calendar" && (
            <CalendarView
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          )}
          {view === "habits" && <HabitsView date={selectedDate} onDateChange={setSelectedDate} />}
          {view === "calories" && (
            <CaloriesView date={selectedDate} onDateChange={setSelectedDate} />
          )}
          {view === "settings" && <SettingsView />}
        </div>
      </main>

      {selectedTask && (
        <NotesEditor task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      )}
    </div>
  );
}
