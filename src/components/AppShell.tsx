import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { useStore } from "../state/store";
import { CategoriesView } from "./CategoriesView";
import { DayView, type MenuPage } from "./DayView";
import { Flower } from "./Flower";
import { HabitsList } from "./HabitEditor";
import { LibraryView } from "./LibraryView";
import { SettingsView } from "./SettingsView";

const TITLES: Record<MenuPage, string> = {
  categories: "Categories",
  library: "Library",
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
function MenuPageView({
  page,
  date,
  onBack,
}: {
  page: MenuPage;
  date: ISODate;
  onBack: () => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <div className="animate-slide fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-12 md:px-6">
        <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 bg-[var(--bg)]/90 px-3 pb-3 pt-4 backdrop-blur-xl md:-mx-6 md:px-5">
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 transition-colors hover:bg-surface-3 active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="min-w-0 truncate text-[24px] font-bold tracking-tight">{title ?? TITLES[page]}</h1>
        </header>
        {page === "categories" ? (
          <>
            <CategoriesView />
            <HabitsList date={date} />
          </>
        ) : page === "library" ? (
          <LibraryView onTitle={setTitle} />
        ) : (
          <SettingsView />
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const { ready } = useStore();
  const onTask = useOnTaskRoute();
  const [selected, setSelected] = useState<ISODate>(todayISO());
  const [page, setPage] = useState<MenuPage | null>(null);
  const [addSignal, setAddSignal] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (page) setPage(null);
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
          <Flower size={44} filled color="#fff" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden" hidden={onTask}>
      <main className="h-full overflow-y-auto overflow-x-hidden pb-[var(--safe-bottom)]">
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
      {page && <MenuPageView page={page} date={selected} onBack={() => setPage(null)} />}
    </div>
  );
}
