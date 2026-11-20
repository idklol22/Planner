import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListFilter, Menu, Plus, Repeat, Settings2, Sparkles, Tags, Settings, Flame } from "lucide-react";
import {
  addDays,
  formatDayTitle,
  fromISODate,
  startOfWeek,
  todayISO,
  type ISODate,
} from "../domain/dates";
import { ghostsFor } from "../domain/habits";
import { CATEGORY_COLORS, type Habit } from "../domain/model";
import { sectionsForDay, tasksForDay, type Section } from "../domain/tasks";
import { useStore } from "../state/store";
import { CalendarStrip, type CalendarMode } from "./CalendarStrip";
import { CalorieBar } from "./CalorieBar";
import { Flower } from "./Flower";
import { HabitEditor } from "./HabitEditor";
import { CategoryIcon } from "./icons";
import { DaySummaryCard, WeekSummaryCard } from "./Summaries";
import { TaskRow } from "./TaskRow";

export type MenuPage = "categories" | "settings";

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
    <div className="animate-row flex min-h-[48px] items-center gap-3 rounded-2xl bg-white/[0.04] px-2 py-1.5">
      <Flower size={30} color={color} />
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
    <div className="animate-row group flex min-h-[48px] items-center gap-3 rounded-2xl px-2 py-1.5 opacity-55 transition-[opacity,background-color] hover:bg-white/[0.04] hover:opacity-90">
      <button
        onClick={onAccept}
        aria-label={`Add "${habit.title}" as a task`}
        className="flower-btn"
      >
        <Flower size={30} color={color} ghost />
      </button>
      <button onClick={onAccept} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        <span className="min-w-0 flex-1 truncate text-[17px] leading-snug text-ink">{habit.title}</span>
        <Repeat size={14} className="shrink-0 text-faint" aria-label="Habit" />
      </button>
      <button
        onClick={onEdit}
        aria-label={`Edit habit ${habit.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-white/10 hover:text-ink active:scale-90"
      >
        <Settings2 size={15} />
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
  onAddHabit,
  onEditHabit,
}: {
  section: Section;
  ghosts: Habit[];
  date: ISODate;
  adding: boolean;
  setAdding: (on: boolean) => void;
  onOpenTask: (id: string) => void;
  onAddHabit: (categoryId: string | null) => void;
  onEditHabit: (habit: Habit) => void;
}) {
  const { actions } = useStore();
  const [menu, setMenu] = useState(false);
  const cat = section.category;
  const color = cat?.color ?? "#ffffff";
  const name = cat?.name ?? "Inbox";
  const body = section.tasks.length > 0 || ghosts.length > 0 || adding;
  return (
    <section aria-label={name} className="relative">
      <div className="flex h-12 items-center gap-2.5 rounded-full bg-surface-2 pl-4 pr-1.5">
        <CategoryIcon name={cat?.icon} size={17} color={color} />
        <h3 className="min-w-0 truncate text-[15px] font-semibold" style={{ color }}>
          {name}
        </h3>
        {section.tasks.length > 0 && (
          <span className="text-[13px] font-medium tabular-nums text-faint">
            {section.tasks.filter((t) => t.done).length}/{section.tasks.length}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label={`Add to ${name}`}
          aria-expanded={menu}
          aria-haspopup="menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-transform hover:scale-105 active:scale-90"
        >
          <Plus
            size={20}
            strokeWidth={2.5}
            className="transition-transform duration-200"
            style={{ transform: menu ? "rotate(45deg)" : undefined }}
          />
        </button>
      </div>
      {menu && (
        <>
          <button
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setMenu(false)}
          />
          <div
            role="menu"
            className="animate-pop absolute right-1 top-[52px] z-20 w-56 origin-top-right overflow-hidden rounded-2xl border border-line-2 bg-surface-3 shadow-2xl shadow-black"
          >
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setAdding(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium hover:bg-white/5"
            >
              <Plus size={17} className="text-muted" /> Add task
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onAddHabit(cat?.id ?? null);
              }}
              className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left text-[15px] font-medium hover:bg-white/5"
            >
              <Flame size={17} className="text-muted" /> Add as habit…
            </button>
          </div>
        </>
      )}
      {body && (
        <div className="mt-1 space-y-0.5 px-1">
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

type EditorState = { habit?: Habit; categoryId?: string | null } | null;

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
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [adding, setAdding] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const [mainMenu, setMainMenu] = useState(false);
  const [mode, setMode] = useState<CalendarMode>("week");
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
      .filter((row) => !prefs.hideEmpty || row.section.tasks.length > 0 || row.ghosts.length > 0);
  }, [data.tasks, data.categories, data.habits, selected, today, prefs]);

  const dayTasks = tasksForDay(data.tasks, selected);
  const open = dayTasks.filter((t) => !t.done).length;

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
  const hasCategories = data.categories.some((c) => !c.archived);
  const showDaySummary = selected < today || (selected === today && hour >= 21);
  const isSunday = fromISODate(selected).getDay() === 0;
  const showWeekSummary = isSunday || (weekPinned && mode === "week");

  function changeMode(next: CalendarMode) {
    setMode(next);
    setWeekPinned(next === "week");
  }

  return (
    <div className="px-4 pb-10 pt-3 md:px-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {rel && (
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">{rel}</div>
          )}
          <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight">
            {formatDayTitle(selected)}
          </h1>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          {selected !== today && (
            <button
              onClick={() => onSelect(today)}
              className="animate-fade h-9 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-95"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setMainMenu((v) => !v)}
            aria-label="Menu"
            aria-expanded={mainMenu}
            aria-haspopup="menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-surface-3 active:scale-90"
          >
            <Menu size={18} />
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
                className="animate-pop absolute right-0 top-11 z-40 w-52 origin-top-right overflow-hidden rounded-2xl border border-line-2 bg-surface-3 shadow-2xl shadow-black"
              >
                {(
                  [
                    ["categories", "Categories", Tags],
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
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium hover:bg-white/5 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <Icon size={17} className="text-muted" /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <CalendarStrip selected={selected} onSelect={onSelect} mode={mode} onModeChange={changeMode} />

      <CalorieBar date={selected} />

      <div className="mb-3 mt-5 flex items-baseline justify-between px-1">
        <div className="text-[13px] font-medium text-muted">
          {dayTasks.length === 0
            ? "Nothing planned"
            : open === 0
              ? "All done. Nice work."
              : `${open} left of ${dayTasks.length}`}
        </div>
      </div>

      {!hasCategories && sections.length === 0 ? (
        <div className="animate-fade rounded-3xl border border-dashed border-white/15 px-5 py-10 text-center">
          <div className="mx-auto mb-4 flex w-fit">
            <Flower size={56} filled color="#8B7CFF" />
          </div>
          <h2 className="text-[19px] font-semibold">Start with a few categories</h2>
          <p className="mx-auto mt-1.5 max-w-[17rem] text-[14px] leading-relaxed text-muted">
            Categories group your tasks each day, each with its own colour. Pick some to begin, change them any time.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((name, i) => (
              <button
                key={name}
                onClick={() => actions.addCategory(name, CATEGORY_COLORS[[8, 4, 0, 6][i]])}
                className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[14px] font-semibold transition-colors hover:bg-surface-3 active:scale-95"
              >
                <Plus size={15} /> {name}
              </button>
            ))}
          </div>
          <button
            onClick={onManageCategories}
            className="mt-4 text-[13px] font-medium text-muted underline underline-offset-4 hover:text-ink"
          >
            Or create your own
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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
                onAddHabit={(categoryId) => setEditor({ categoryId })}
                onEditHabit={(habit) => setEditor({ habit })}
              />
            );
          })}
          {sections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-[14px] text-muted">
              <Sparkles size={20} className="mx-auto mb-2 text-faint" />
              Nothing to show. Turn off &quot;Hide empty categories&quot; in the list menu to add tasks.
            </div>
          )}
        </div>
      )}

      {(showDaySummary || showWeekSummary) && (
        <div className="mt-6 space-y-3">
          {showDaySummary && <DaySummaryCard date={selected} />}
          {showWeekSummary && <WeekSummaryCard start={startOfWeek(selected)} />}
        </div>
      )}

      {hasCategories && (
        <div className="relative mt-8">
          <div className="border-t-2 border-dotted border-white/15" />
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setListMenu((v) => !v)}
              aria-expanded={listMenu}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-white/10 hover:text-ink"
            >
              <ListFilter size={16} /> List menu
            </button>
          </div>
          {listMenu && (
            <>
              <button
                aria-label="Close list menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setListMenu(false)}
              />
              <div className="animate-pop absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-surface-2 shadow-2xl shadow-black">
                {(
                  [
                    ["showCompleted", "Show completed"],
                    ["hideEmpty", "Hide empty categories"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[15px] hover:bg-white/5"
                  >
                    {label}
                    {prefs[key] && <Check size={17} />}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setListMenu(false);
                    onManageCategories();
                  }}
                  className="w-full border-t border-line px-4 py-3.5 text-left text-[15px] hover:bg-white/5"
                >
                  Reorder categories
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {editor && (
        <HabitEditor
          habit={editor.habit}
          categoryId={editor.categoryId}
          date={selected < today ? today : selected}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
