import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Library, ListFilter, Menu, MessageSquare, Plus, Repeat, Settings2, Sparkles, Tags, Settings, Flame } from "lucide-react";
import {
  addDays,
  formatDayTitle,
  fromISODate,
  startOfWeek,
  todayISO,
  type ISODate,
} from "../domain/dates";
import { ghostsFor } from "../domain/habits";
import { type Habit } from "../domain/model";
import { CATEGORY_COLORS } from "../domain/palette";
import { catColor } from "../theme/store";
import { dayKcal } from "../domain/calories";
import { sectionsForDay, tasksForDay, unfinishedTopLevelOn, type Section } from "../domain/tasks";
import { useMessages } from "../state/messages";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { CalendarStrip, type CalendarMode } from "./CalendarStrip";
import { CalorieBar } from "./CalorieBar";
import { DeadlinesCard } from "./DeadlinesCard";
import { Flower } from "./Flower";
import { HabitEditor } from "./HabitEditor";
import { CategoryGoals } from "./CategoryGoals";
import { CalendarArrowRight, CategoryIcon } from "./icons";
import { DaySummaryCard, WeekSummaryCard } from "./Summaries";
import { TaskRow } from "./TaskRow";

export type MenuPage = "categories" | "habits" | "library" | "chat" | "archive" | "settings";

interface Prefs {
  showCompleted: boolean;
  hideEmpty: boolean;
}
const PREFS_KEY = "planner.prefs";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { showCompleted: true, hideEmpty: false, ...JSON.parse(raw) };
  } catch {
    // ignore: fall back to defaults
  }
  return { showCompleted: true, hideEmpty: false };
}

function InlineAdd({
  color,
  onAdd,
  onClose,
}: {
  color: string;
  onAdd: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
  return (
    <div className="animate-row flex min-h-[52px] items-center gap-3.5 rounded-xl bg-ink/[0.05] px-2 py-1">
      <Flower size={32} color={color} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New task, press Enter"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[17px] text-ink outline-none placeholder:text-faint"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        onBlur={() => {
          if (!value.trim()) onClose();
        }}
      />
    </div>
  );
}

/** A habit suggestion for the day: faded row with a dashed flower. Tap to make it a task. */
function GhostRow({
  habit,
  color,
  onAccept,
  onEdit,
}: {
  habit: Habit;
  color: string;
  onAccept: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="animate-row group flex min-h-[52px] items-center gap-3.5 rounded-xl px-2 py-1 opacity-55 transition-[opacity,background-color] hover:bg-ink/[0.04] hover:opacity-90">
      <button
        onClick={onAccept}
        aria-label={`Add "${habit.title}" as a task`}
        className="flower-btn"
      >
        <Flower size={32} color={color} ghost />
      </button>
      <button onClick={onAccept} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        <span className="min-w-0 flex-1 truncate text-[17px] leading-snug text-ink">{habit.title}</span>
        <Repeat size={16} className="shrink-0 text-faint" aria-label="Habit" />
      </button>
      <button
        onClick={onEdit}
        aria-label={`Edit habit ${habit.title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-faint transition-colors hover:bg-ink/10 hover:text-ink active:scale-90"
      >
        <Settings2 size={17} />
      </button>
    </div>
  );
}

function CategorySection({
  section,
  ghosts,
  date,
  adding,
  setAdding,
  onOpenTask,
  onEditHabit,
}: {
  section: Section;
  ghosts: Habit[];
  date: ISODate;
  adding: boolean;
  setAdding: (on: boolean) => void;
  onOpenTask: (id: string) => void;
  onEditHabit: (habit: Habit) => void;
}) {
  const { actions } = useStore();
  const cat = section.category;
  const color = cat ? catColor(cat.color) : "var(--accent)";
  const name = cat?.name ?? "Inbox";
  const body = section.tasks.length > 0 || ghosts.length > 0 || adding;
  return (
    <section aria-label={name} className="module">
      <div className="module-head !mb-1">
        <CategoryIcon name={cat?.icon} size={19} color={color} />
        <h3 className="min-w-0 truncate text-[17px] font-semibold" style={{ color }}>
          {name}
        </h3>
        {section.tasks.length > 0 && (
          <span className="text-[14px] font-medium tabular-nums text-faint">
            {section.tasks.filter((t) => t.done).length}/{section.tasks.length}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => setAdding(!adding)}
          aria-label={`Add task to ${name}`}
          aria-pressed={adding}
          className="mod-btn !min-w-10 !px-0 !bg-ink/[0.07] !text-ink"
        >
          <Plus
            size={20}
            strokeWidth={2.25}
            className="transition-transform duration-200"
            style={{ transform: adding ? "rotate(45deg)" : undefined }}
          />
        </button>
      </div>
      {cat && <CategoryGoals categoryId={cat.id} color={color} />}
      {body && (
        <div className="space-y-0.5">
          {section.tasks.map((task) => (
            <TaskRow key={task.id} task={task} color={color} onOpen={onOpenTask} />
          ))}
          {ghosts.map((habit) => (
            <GhostRow
              key={habit.id}
              habit={habit}
              color={color}
              onAccept={() => actions.acceptGhost(habit.id, date)}
              onEdit={() => onEditHabit(habit)}
            />
          ))}
          {adding && (
            <InlineAdd
              color={color}
              onClose={() => setAdding(false)}
              onAdd={(title) => actions.addTask(date, title, cat?.id ?? null)}
            />
          )}
        </div>
      )}
    </section>
  );
}

const SUGGESTIONS = ["Study", "Work", "Health", "Personal"];

/** Re-renders every minute so the "after 21:00" summary appears on its own. */
function useHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return hour;
}

type EditorState = Habit | null;

export function DayView({
  selected,
  onSelect,
  addSignal,
  onOpenPage,
  onManageCategories,
}: {
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  addSignal: number;
  onOpenPage: (page: MenuPage) => void;
  onManageCategories: () => void;
}) {
  const { data, actions } = useStore();
  const notify = useToast();
  const { unread } = useMessages();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [adding, setAdding] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const [mainMenu, setMainMenu] = useState(false);
  const [mode, setMode] = useState<CalendarMode>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches ? "month" : "week",
  );
  const [weekPinned, setWeekPinned] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const hour = useHour();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  const today = todayISO();

  const sections = useMemo(() => {
    const base = sectionsForDay(data.tasks, data.categories, selected, { showCompleted: prefs.showCompleted });
    // Habit ghosts are suggestions for today and the future, never for past days.
    const ghosts = selected >= today ? ghostsFor(selected, data.habits, data.tasks) : [];
    const live = new Set(base.map((s) => s.category?.id).filter(Boolean));
    const forSection = (s: Section) =>
      ghosts.filter((h) =>
        s.category ? h.categoryId === s.category.id : !h.categoryId || !live.has(h.categoryId),
      );
    const withInbox =
      !base.some((s) => !s.category) && ghosts.some((h) => !h.categoryId || !live.has(h.categoryId))
        ? [...base, { category: null, tasks: [] } as Section]
        : base;
    return withInbox
      .map((section) => ({ section, ghosts: forSection(section) }))
      .filter(
        (row) =>
          !prefs.hideEmpty ||
          row.section.tasks.length > 0 ||
          row.ghosts.length > 0 ||
          (!!row.section.category &&
            data.goals.some((g) => g.categoryId === row.section.category!.id && !g.deletedAt && !g.achievedAt)),
      );
  }, [data.tasks, data.categories, data.habits, data.goals, selected, today, prefs]);

  const dayTasks = tasksForDay(data.tasks, selected);
  const open = dayTasks.filter((t) => !t.done).length;
  const canMoveAllToToday = selected < today && unfinishedTopLevelOn(data.tasks, selected).length > 0;

  function moveAllToToday() {
    const { moved, undo } = actions.moveUnfinishedToToday(selected);
    notify(`Moved ${moved} unfinished task${moved === 1 ? "" : "s"} to today`, "success", {
      label: "Undo",
      onClick: undo,
    });
  }

  // `n` shortcut: open the inline input of the first category.
  const firstKey = sections[0] ? (sections[0].section.category?.id ?? "__inbox") : null;
  const lastSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== lastSignal.current) {
      lastSignal.current = addSignal;
      if (firstKey) setAdding(firstKey);
    }
  }, [addSignal, firstKey]);

  useEffect(() => setAdding(null), [selected]);

  const rel =
    selected === today
      ? "Today"
      : selected === addDays(today, 1)
        ? "Tomorrow"
        : selected === addDays(today, -1)
          ? "Yesterday"
          : null;
  const hasCategories = data.categories.some((c) => !c.archived && !c.deletedAt);
  const showDaySummary = selected < today || (selected === today && hour >= 21);
  const isSunday = fromISODate(selected).getDay() === 0;
  const showWeekSummary = isSunday || (weekPinned && mode === "week");

  function changeMode(next: CalendarMode) {
    setMode(next);
    setWeekPinned(next === "week");
  }

  return (
    <div className="px-4 pt-[calc(12px+var(--safe-top))] md:px-6 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start lg:gap-4 lg:px-8 lg:pt-6">
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
      <header className="flex items-center justify-between gap-3 lg:contents">
        <div className="min-w-0 lg:hidden">
          {rel && (
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">{rel}</div>
          )}
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-tight">
            {formatDayTitle(selected)}
          </h1>
        </div>
        <div className="relative flex shrink-0 items-center gap-2 lg:fixed lg:right-6 lg:top-5 lg:z-30">
          {selected !== today && (
            <button
              onClick={() => onSelect(today)}
              className="animate-fade h-10 rounded-xl bg-ink/[0.07] px-4 text-[15px] font-semibold text-muted transition-colors hover:bg-ink/[0.12] hover:text-ink active:scale-95"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setMainMenu((v) => !v)}
            aria-label="Menu"
            aria-expanded={mainMenu}
            aria-haspopup="menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/[0.07] text-ink transition-colors hover:bg-ink/[0.12] active:scale-90"
          >
            <Menu size={20} />
          </button>
          {mainMenu && (
            <>
              <button
                aria-label="Close menu"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMainMenu(false)}
              />
              <div
                role="menu"
                className="animate-pop absolute right-0 top-12 z-40 w-56 origin-top-right overflow-hidden rounded-2xl border border-line-2 bg-[var(--pop)] shadow-2xl shadow-black"
              >
                {(
                  [
                    ["categories", "Categories", Tags],
                    ["habits", "Habits", Flame],
                    ["library", "Library", Library],
                    ["chat", "LearnHarness", MessageSquare],
                    ["archive", "Archive", Archive],
                    ["settings", "Settings", Settings],
                  ] as const
                ).map(([page, label, Icon], i) => (
                  <button
                    key={page}
                    role="menuitem"
                    onClick={() => {
                      setMainMenu(false);
                      onOpenPage(page);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-4 text-left text-[16px] font-medium hover:bg-ink/5 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <Icon size={18} className="text-muted" /> {label}
                    {page === "chat" && unread > 0 && (
                      <span
                        aria-label={`${unread} unread messages`}
                        className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold tabular-nums text-[var(--accent-contrast)]"
                      >
                        {unread}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <CalendarStrip selected={selected} onSelect={onSelect} mode={mode} onModeChange={changeMode} />

      <CalorieBar date={selected} />

      <section aria-label="Today" className="module">
        <div className="module-head !mb-1">
          <h2 className="module-title">{rel ?? "Selected day"}</h2>
        </div>
        <div className="hidden items-baseline gap-3 lg:flex">
          <div className="text-[28px] font-bold leading-none tracking-tight">
            {fromISODate(selected).toLocaleDateString("en-GB", { weekday: "long" })}
          </div>
          <div className="text-[18px] font-semibold leading-tight text-muted">
            {fromISODate(selected).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </div>
        </div>
        <div className="mt-2 text-[16px] font-medium text-muted lg:mt-3">
          {dayTasks.length - open} of {dayTasks.length} done · {dayKcal(data.calories, selected).toLocaleString("en-US")} kcal
        </div>
      </section>
      </div>

      <div className="mt-4 min-w-0 lg:mt-0">

      <div className="relative mb-3 flex items-center justify-between px-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-[15px] font-medium text-muted">
            {dayTasks.length === 0
              ? "Nothing planned"
              : open === 0
                ? "All done. Nice work."
                : `${open} left of ${dayTasks.length}`}
          </div>
          {canMoveAllToToday && (
            <button
              onClick={moveAllToToday}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-[14px] font-semibold text-accent-ink transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-accent"
            >
              <CalendarArrowRight size={16} />
              <span className="hidden sm:inline">Move all to today</span>
              <span className="sm:hidden">Move all</span>
            </button>
          )}
        </div>
        {hasCategories && (
          <>
            <button
              onClick={() => setListMenu((v) => !v)}
              aria-expanded={listMenu}
              aria-label="List menu"
              title="List menu"
              className="mod-btn gap-2"
            >
              <ListFilter size={18} /> <span className="hidden sm:inline">List menu</span>
            </button>
            {listMenu && (
              <>
                <button
                  aria-label="Close list menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setListMenu(false)}
                />
                <div className="animate-pop absolute right-0 top-full z-20 mt-1 w-72 origin-top-right overflow-hidden rounded-2xl border border-line-2 bg-[var(--pop)] shadow-2xl shadow-black">
                  {(
                    [
                      ["showCompleted", "Show completed"],
                      ["hideEmpty", "Hide empty categories"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                      className="flex w-full items-center justify-between px-4 py-4 text-left text-[16px] hover:bg-ink/5"
                    >
                      {label}
                      {prefs[key] && <Check size={18} />}
                    </button>
                  ))}
                  {selected === today && (
                    <button
                      onClick={() => {
                        const n = actions.moveUnfinishedToTomorrow(selected);
                        setListMenu(false);
                        notify(
                          n ? `Moved ${n} task${n === 1 ? "" : "s"} to tomorrow` : "No unfinished tasks to move",
                          n ? "success" : "info",
                        );
                      }}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left text-[16px] hover:bg-ink/5"
                    >
                      <CalendarArrowRight size={16} className="text-muted" /> Move unfinished to tomorrow
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setListMenu(false);
                      onManageCategories();
                    }}
                    className="w-full border-t border-line px-4 py-4 text-left text-[16px] hover:bg-ink/5"
                  >
                    Reorder categories
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!hasCategories && sections.length === 0 ? (
        <div className="animate-fade module !border !border-dashed !border-ink/15 px-5 py-10 text-center">
          <div className="mx-auto mb-4 flex w-fit">
            <Flower size={56} filled color={CATEGORY_COLORS[8]} />
          </div>
          <h2 className="text-[20px] font-semibold">Start with a few categories</h2>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-[15px] leading-relaxed text-muted">
            Categories group your tasks each day, each with its own colour. Pick some to begin, change them any time.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((name, i) => (
              <button
                key={name}
                onClick={() => actions.addCategory(name, CATEGORY_COLORS[[8, 4, 0, 6][i]])}
                className="flex items-center gap-1.5 rounded-xl bg-ink/[0.07] px-4 py-2.5 text-[15px] font-semibold transition-colors hover:bg-ink/[0.12] active:scale-95"
              >
                <Plus size={15} /> {name}
              </button>
            ))}
          </div>
          <button
            onClick={onManageCategories}
            className="mt-4 text-[14px] font-medium text-muted underline underline-offset-4 hover:text-ink"
          >
            Or create your own
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map(({ section, ghosts }) => {
            const key = section.category?.id ?? "__inbox";
            return (
              <CategorySection
                key={key}
                section={section}
                ghosts={ghosts}
                date={selected}
                adding={adding === key}
                setAdding={(on) => setAdding(on ? key : null)}
                onOpenTask={(id) => {
                  window.location.hash = `#/task/${id}`;
                }}
                onEditHabit={(habit) => setEditor(habit)}
              />
            );
          })}
          {sections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-ink/12 px-4 py-8 text-center text-[15px] text-muted">
              <Sparkles size={20} className="mx-auto mb-2 text-faint" />
              Nothing to show. Turn off &quot;Hide empty categories&quot; in the list menu to add tasks.
            </div>
          )}
        </div>
      )}

      <DeadlinesCard date={selected} />

      {(showDaySummary || showWeekSummary) && (
        <div className="mt-4 space-y-4">
          {showDaySummary && <DaySummaryCard date={selected} />}
          {showWeekSummary && <WeekSummaryCard start={startOfWeek(selected)} />}
        </div>
      )}

      </div>

      {editor && (
        <HabitEditor
          habit={editor}
          date={selected < today ? today : selected}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
