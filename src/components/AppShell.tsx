import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  Flame,
  Menu,
  NotebookText,
  Settings,
  Tags,
  X,
  type LucideIcon,
} from "lucide-react";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import type { CalendarMode } from "./CalendarStrip";
import { CaloriesView } from "./CaloriesView";
import { CategoriesView } from "./CategoriesView";
import { DayView } from "./DayView";
import { Flower } from "./Flower";
import { HabitsView } from "./HabitsView";
import { NotesView } from "./NotesView";
import { SettingsView } from "./SettingsView";
import { TaskSheet } from "./TaskSheet";

export type View = "today" | "notes" | "categories" | "habits" | "calories" | "settings";

const TITLES: Record<Exclude<View, "today">, string> = {
  notes: "Notes",
  categories: "Categories",
  habits: "Habits",
  calories: "Calories",
  settings: "Settings",
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function Drawer({
  onClose,
  items,
}: {
  onClose: () => void;
  items: { label: string; icon: LucideIcon; active: boolean; onPick: () => void }[];
}) {
  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Close menu"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
      />
      <nav
        aria-label="Menu"
        className="animate-drawer absolute inset-y-0 right-0 flex w-[min(320px,86vw)] flex-col border-l border-line-2 bg-[#0b0b0b] px-3 pb-6 pt-4"
      >
        <div className="mb-4 flex items-center justify-between px-3">
          <div className="flex items-center gap-2.5">
            <Flower size={30} filled color="#fff" />
            <span className="text-[19px] font-bold tracking-tight">Planner</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-ink active:scale-90"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-1">
          {items.map(({ label, icon: Icon, active, onPick }) => (
            <button
              key={label}
              onClick={onPick}
              className={`flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-[17px] font-semibold transition-colors ${
                active ? "bg-white/10 text-ink" : "text-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function TabBar({
  tabs,
}: {
  tabs: { label: string; icon: LucideIcon; active: boolean; onPick: () => void }[];
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-black/90 pb-[var(--safe-bottom)] backdrop-blur-xl md:hidden"
    >
      {tabs.map(({ label, icon: Icon, active, onPick }) => (
        <button
          key={label}
          onClick={onPick}
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-semibold transition-colors active:scale-95 ${
            active ? "text-ink" : "text-faint"
          }`}
        >
          <Icon size={22} strokeWidth={active ? 2.4 : 2} />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { ready } = useStore();
  const [view, setView] = useState<View>("today");
  const [mode, setMode] = useState<CalendarMode>("week");
  const [selected, setSelected] = useState<ISODate>(todayISO());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addSignal, setAddSignal] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (menuOpen) setMenuOpen(false);
        else if (openTaskId) setOpenTaskId(null);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && view === "today") {
        e.preventDefault();
        setAddSignal((s) => s + 1);
      } else if (e.key === "t") {
        setView("today");
        setSelected(todayISO());
      } else if (e.key === "ArrowLeft" && view === "today") {
        setSelected((d) => addDays(d, -1));
      } else if (e.key === "ArrowRight" && view === "today") {
        setSelected((d) => addDays(d, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, openTaskId, view]);

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-black">
        <div className="animate-pulse">
          <Flower size={44} filled color="#fff" />
        </div>
      </div>
    );
  }

  const go = (next: View, nextMode?: CalendarMode) => {
    setView(next);
    if (nextMode) setMode(nextMode);
    setMenuOpen(false);
  };

  const navItems = [
    { label: "Today", icon: CalendarCheck, active: view === "today" && mode === "week", onPick: () => { go("today", "week"); setSelected(todayISO()); } },
    { label: "Calendar", icon: CalendarDays, active: view === "today" && mode === "month", onPick: () => go("today", "month") },
    { label: "Notes", icon: NotebookText, active: view === "notes", onPick: () => go("notes") },
  ];
  const drawerItems = [
    ...navItems,
    { label: "Categories", icon: Tags, active: view === "categories", onPick: () => go("categories") },
    { label: "Habits", icon: Flame, active: view === "habits", onPick: () => go("habits") },
    { label: "Calories", icon: Dumbbell, active: view === "calories", onPick: () => go("calories") },
    { label: "Settings", icon: Settings, active: view === "settings", onPick: () => go("settings") },
  ];
  const tabs = [
    ...navItems,
    { label: "Menu", icon: Menu, active: menuOpen || ["categories", "habits", "calories", "settings"].includes(view), onPick: () => setMenuOpen(true) },
  ];

  let content: ReactNode;
  if (view === "today") {
    content = (
      <DayView
        selected={selected}
        onSelect={setSelected}
        mode={mode}
        onModeChange={setMode}
        openTaskId={openTaskId}
        onOpenTask={setOpenTaskId}
        addSignal={addSignal}
        onOpenMenu={() => setMenuOpen(true)}
        onManageCategories={() => go("categories")}
      />
    );
  } else {
    const body =
      view === "notes" ? (
        <NotesView onOpenTask={setOpenTaskId} openTaskId={openTaskId} />
      ) : view === "categories" ? (
        <CategoriesView />
      ) : view === "habits" ? (
        <div className="px-4 pb-8 md:px-6">
          <HabitsView date={selected} onDateChange={setSelected} />
        </div>
      ) : view === "calories" ? (
        <div className="px-4 pb-8 md:px-6">
          <CaloriesView date={selected} onDateChange={setSelected} />
        </div>
      ) : (
        <div className="px-4 pb-8 md:px-6">
          <SettingsView />
        </div>
      );
    content = (
      <>
        <header className="flex items-center justify-between px-4 pb-3 pt-4 md:px-6">
          <h1 className="text-[28px] font-bold tracking-tight">{TITLES[view]}</h1>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 hover:bg-surface-3 active:scale-90"
          >
            <Menu size={18} />
          </button>
        </header>
        {body}
      </>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-black">
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(76px+var(--safe-bottom))] md:pb-6">
        <div key={view} className="animate-fade mx-auto w-full max-w-[720px]">
          {content}
        </div>
      </main>
      {openTaskId && <TaskSheet taskId={openTaskId} onOpen={setOpenTaskId} />}
      <TabBar tabs={tabs} />
      {menuOpen && <Drawer onClose={() => setMenuOpen(false)} items={drawerItems} />}
    </div>
  );
}
