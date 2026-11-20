import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListFilter, Menu, Plus, Sparkles } from "lucide-react";
import {
  formatDayTitle,
  todayISO,
  addDays,
  type ISODate,
} from "../domain/dates";
import { CATEGORY_COLORS } from "../domain/model";
import { sectionsForDay, tasksForDay, type Section } from "../domain/tasks";
import { useStore } from "../state/store";
import { CalendarStrip, type CalendarMode } from "./CalendarStrip";
import { Flower } from "./Flower";
import { CategoryIcon } from "./icons";
import { TaskRow } from "./TaskRow";

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

function CategorySection({
  section,
  date,
  adding,
  setAdding,
  openTaskId,
  onOpenTask,
}: {
  section: Section;
  date: ISODate;
  adding: boolean;
  setAdding: (on: boolean) => void;
  openTaskId: string | null;
  onOpenTask: (id: string) => void;
}) {
  const { actions } = useStore();
  const cat = section.category;
  const color = cat?.color ?? "#ffffff";
  const name = cat?.name ?? "Inbox";
  return (
    <section aria-label={name}>
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
          onClick={() => setAdding(true)}
          aria-label={`Add task to ${name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-transform hover:scale-105 active:scale-90"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>
      {(section.tasks.length > 0 || adding) && (
        <div className="mt-1 space-y-0.5 px-1">
          {section.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              color={color}
              active={openTaskId === task.id}
              onOpen={onOpenTask}
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

export function DayView({
  selected,
  onSelect,
  mode,
  onModeChange,
  openTaskId,
  onOpenTask,
  addSignal,
  onOpenMenu,
  onManageCategories,
}: {
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  openTaskId: string | null;
  onOpenTask: (id: string) => void;
  addSignal: number;
  onOpenMenu: () => void;
  onManageCategories: () => void;
}) {
  const { data, actions } = useStore();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [adding, setAdding] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  const sections = useMemo(
    () => sectionsForDay(data.tasks, data.categories, selected, prefs),
    [data.tasks, data.categories, selected, prefs],
  );
  const dayTasks = tasksForDay(data.tasks, selected);
  const open = dayTasks.filter((t) => !t.done).length;

  // `n` shortcut: open the inline input of the first category.
  const firstKey = sections[0] ? (sections[0].category?.id ?? "__inbox") : null;
  const lastSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== lastSignal.current) {
      lastSignal.current = addSignal;
      if (firstKey) setAdding(firstKey);
    }
  }, [addSignal, firstKey]);

  useEffect(() => setAdding(null), [selected]);

  const today = todayISO();
  const rel =
    selected === today
      ? "Today"
      : selected === addDays(today, 1)
        ? "Tomorrow"
        : selected === addDays(today, -1)
          ? "Yesterday"
          : null;
  const hasCategories = data.categories.some((c) => !c.archived);

  return (
    <div className="px-4 pb-8 pt-3 md:px-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {rel && (
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">{rel}</div>
          )}
          <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight">
            {formatDayTitle(selected)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex rounded-full bg-surface-2 p-0.5" role="tablist" aria-label="Calendar view">
            {(["month", "week"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => onModeChange(m)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                  mode === m ? "bg-white text-black" : "text-muted hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={onOpenMenu}
            aria-label="Menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-surface-3 active:scale-90"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      <CalendarStrip selected={selected} onSelect={onSelect} mode={mode} />

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
          {sections.map((section) => {
            const key = section.category?.id ?? "__inbox";
            return (
              <CategorySection
                key={key}
                section={section}
                date={selected}
                adding={adding === key}
                setAdding={(on) => setAdding(on ? key : null)}
                openTaskId={openTaskId}
                onOpenTask={onOpenTask}
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
              <div className="animate-row absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-surface-2 shadow-2xl shadow-black">
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
    </div>
  );
}
