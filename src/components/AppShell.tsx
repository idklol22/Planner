import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { useNavCommand } from "../state/deeplink";
import { useStore } from "../state/store";
import { useThemeState } from "../theme/store";
import { ArchiveView } from "./ArchiveView";
import { CategoriesView } from "./CategoriesView";
import { DayView, type MenuPage } from "./DayView";
import { TaskMark } from "./TaskMark";
import { HabitsView } from "./HabitsView";
import { SettingsView } from "./SettingsView";

const TITLES: Record<MenuPage, string> = {
  categories: "Categories",
  habits: "Habits",
  archive: "Archive",
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

/** True while the task document page (`#/task/<id>`, rendered elsewhere) is open. */
function useOnTaskRoute(): boolean {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash.startsWith("#/task/");
}

/** Full-screen page opened from the menu, with a back arrow. */
function MenuPageView({ page, onBack }: { page: MenuPage; onBack: () => void }) {
  return (
    <div className="animate-slide fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain bg-[var(--bg)]/40">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-[max(16px,var(--safe-bottom))] md:px-6 overscroll-contain">
        <header className="sticky top-0 z-10 -mx-4 mb-2 flex shrink-0 items-center gap-2 bg-[var(--bg)]/90 px-3 pb-3 pt-[calc(16px+var(--safe-top))] backdrop-blur-xl md:-mx-6 md:px-5">
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="min-w-0 truncate text-[18px] font-bold tracking-tight">{TITLES[page]}</h1>
        </header>
        {page === "categories" ? (
          <CategoriesView />
        ) : page === "habits" ? (
          <HabitsView date={todayISO()} />
        ) : page === "archive" ? (
          <ArchiveView />
        ) : (
          <SettingsView />
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const { ready } = useStore();
  useThemeState(); // re-render the tree when the theme changes: category colours are re-lit per theme
  const onTask = useOnTaskRoute();
  const [selected, setSelected] = useState<ISODate>(todayISO());
  const [page, setPage] = useState<MenuPage | null>(null);
  const [addSignal, setAddSignal] = useState(0);
  const nav = useNavCommand();
  const lastNav = useRef(0);

  // planner://today and planner://calories: show today and leave any menu page.
  useEffect(() => {
    if (!nav.seq || nav.seq === lastNav.current) return;
    lastNav.current = nav.seq;
    setSelected(nav.date || todayISO());
    setPage(null);
    if (window.location.hash.startsWith("#/task/")) window.location.hash = "";
  }, [nav]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // A full-screen sheet (e.g. the habit editor) owns Escape while it is open.
        if (page && !document.querySelector('[role="dialog"]')) setPage(null);
        return;
      }
      if (page || onTask || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") {
        e.preventDefault();
        setAddSignal((s) => s + 1);
      } else if (e.key === "t") {
        setSelected(todayISO());
      } else if (e.key === "ArrowLeft") {
        setSelected((d) => addDays(d, -1));
      } else if (e.key === "ArrowRight") {
        setSelected((d) => addDays(d, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onTask]);

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <div className="animate-pulse">
          <TaskMark size={40} done />
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden" hidden={onTask}>
      <main
        hidden={!!page}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-contain pb-[max(16px,var(--safe-bottom))]"
      >
        <div className="animate-fade mx-auto w-full max-w-[560px] lg:max-w-[1200px]">
          <DayView
            selected={selected}
            onSelect={setSelected}
            addSignal={addSignal}
            onOpenPage={setPage}
            onManageCategories={() => setPage("categories")}
          />
        </div>
      </main>
      {page && <MenuPageView page={page} onBack={() => setPage(null)} />}
    </div>
  );
}
