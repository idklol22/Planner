import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { MOTION_MS, usePresence } from "../lib/motion";
import { useNavCommand } from "../state/deeplink";
import { useStore } from "../state/store";
import { useThemeState } from "../theme/store";
import { ArchiveView } from "./ArchiveView";
import { CategoriesView } from "./CategoriesView";
import { DayView, type MenuPage } from "./DayView";
import { TaskMark } from "./TaskMark";
import { HabitsView } from "./HabitsView";
import { SettingsView } from "./SettingsView";
import { useEdgeBackSwipe } from "./pageSwipe";

const TITLES: Record<MenuPage, string> = {
  categories: "Categories",
  habits: "Habits",
  archive: "Archive",
  settings: "Settings",
};

/** Re-render at local midnight (and on resume) so "Today", habit ghosts and
 *  the calendar's current-day mark follow the real day when the app stays open. */
function useTodayTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer = 0;
    let current = todayISO();
    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = window.setTimeout(check, Math.max(1000, midnight.getTime() - now.getTime()));
    };
    function check() {
      const next = todayISO();
      if (next !== current) {
        current = next;
        setTick((n) => n + 1);
      }
      schedule();
    }
    schedule();
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
}

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

/** Full-screen page opened from the menu, with a back arrow. It pushes in from
 *  the right, follows an edge drag 1:1, and pops back out on exit. */
function MenuPageView({
  page,
  closing,
  dragging,
  dragDx,
  onBack,
  bind,
}: {
  page: MenuPage;
  closing: boolean;
  dragging: boolean;
  dragDx: number;
  onBack: () => void;
  bind: ReturnType<typeof useEdgeBackSwipe>["bind"];
}) {
  return (
    <div
      {...bind}
      className={`page touch-pan-y fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain ${
        closing ? "is-exiting" : ""
      } ${dragging ? "is-dragging" : ""}`}
      style={dragging ? { transform: `translateX(${dragDx}px)` } : undefined}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col overscroll-contain">
        <header className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-[calc(16px+var(--safe-top))] md:px-5">
          <button
            onClick={onBack}
            aria-label="Back"
            className="ui-press flex h-11 w-11 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="min-w-0 truncate text-[18px] font-bold tracking-tight">{TITLES[page]}</h1>
        </header>
        <div className="sheet flex-1">
          <div className="px-3 pb-[max(24px,var(--safe-bottom))] pt-4 md:px-5">
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
      </div>
    </div>
  );
}

export function AppShell() {
  useTodayTick();
  const { ready } = useStore();
  useThemeState(); // re-render the tree when the theme changes: category colours are re-lit per theme
  const onTask = useOnTaskRoute();
  const [selected, setSelected] = useState<ISODate>(todayISO());
  const [page, setPage] = useState<MenuPage | null>(null);
  const [shownPage, setShownPage] = useState<MenuPage | null>(null);
  const [addSignal, setAddSignal] = useState(0);
  const nav = useNavCommand();
  const lastNav = useRef(0);

  // Keep the last page mounted until its pop-out animation has finished.
  const presence = usePresence(!!page, MOTION_MS.base);
  if (page && page !== shownPage) setShownPage(page);
  const back = useCallback(() => setPage(null), []);
  const edge = useEdgeBackSwipe({ enabled: presence.mounted && !presence.closing, onBack: back });

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
      <div className="app-viewport flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse">
          <TaskMark size={40} done />
        </div>
      </div>
    );
  }

  return (
    /* The task screen is an opaque overlay: keep the day painted so it shows under the slide,
       and so its rows do not replay their entrance on the way back. */
    <div className="app-viewport overflow-hidden" inert={onTask}>
      <main
        inert={!!page}
        className={`h-full overflow-y-auto overflow-x-hidden overscroll-contain ${
          presence.mounted ? "page-behind" : ""
        } ${edge.dragging ? "is-page-dragging" : ""} ${presence.closing ? "is-page-exiting" : ""}`}
      >
        <div className="animate-fade mx-auto flex min-h-full w-full max-w-[560px] flex-col lg:max-w-[1200px]">
          <DayView
            selected={selected}
            onSelect={setSelected}
            addSignal={addSignal}
            onOpenPage={setPage}
            onManageCategories={() => setPage("categories")}
            active={!page && !onTask}
          />
        </div>
      </main>
      {presence.mounted && shownPage && (
        <MenuPageView
          page={shownPage}
          closing={presence.closing}
          dragging={edge.dragging}
          dragDx={edge.dx}
          onBack={back}
          bind={edge.bind}
        />
      )}
    </div>
  );
}
