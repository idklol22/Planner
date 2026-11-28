import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
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
import { sectionsForDay, tasksForDay, unfinishedTopLevelOn, type Section } from "../domain/tasks";
import {
  resolveSwipe,
  rubberBand,
  SWIPE_COMMIT_PX,
  SWIPE_MAX_PX,
  type SwipeState,
} from "../domain/swipe";
import {
  daySlideDirection,
  partitionDaySections,
  sectionKey,
  type DaySectionRow,
} from "../domain/daySections";
import { MOTION_MS, usePresence } from "../lib/motion";
import { MotionRow, useFlipRows, useMotionRows } from "../motion/dayMotion";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { Calendar, type CalendarMode } from "./Calendar";
import { CalorieBar } from "./CalorieBar";
import { DeadlinesCard } from "./DeadlinesCard";
import { TaskMark } from "./TaskMark";
import { HabitEditor } from "./HabitEditor";
import { CategoryGoals } from "./CategoryGoals";
import { WeekSummaryCard } from "./Summaries";
import { TaskRow } from "./TaskRow";
import { Composer, type ComposerTargetId } from "./Composer";

export type MenuPage = "categories" | "habits" | "archive" | "settings";

const MENU_ITEMS: readonly (readonly [MenuPage, string])[] = [
  ["categories", "Categories"],
  ["habits", "Habits"],
  ["archive", "Archive"],
  ["settings", "Settings"],
];

interface Prefs {
  showCompleted: boolean;
}
const PREFS_KEY = "planner.prefs";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { showCompleted: true, ...JSON.parse(raw) };
  } catch {
    // ignore: fall back to defaults
  }
  return { showCompleted: true };
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
  );
}

/** A habit suggestion for the day: faded row with a dashed mark. Tap to make it a task. */
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
    <div className="group flex min-h-11 items-center gap-1.5 opacity-70 transition-opacity hover:opacity-100">
      <button onClick={onAccept} aria-label={`Add "${habit.title}" as a task`} className="mark-btn day-press">
        <TaskMark color={color} ghost />
      </button>
      <button onClick={onAccept} className="day-press flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        <span className="min-w-0 flex-1 truncate text-[14.5px] leading-snug text-faint">{habit.title}</span>
        <span className="shrink-0 text-[12px] text-faint">habit</span>
      </button>
      <button
        onClick={onEdit}
        aria-label={`Edit habit ${habit.title}`}
        className="day-press flex h-11 w-11 shrink-0 items-center justify-center text-[14px] text-faint hover:text-ink"
      >
        ...
      </button>
    </div>
  );
}

const SWIPE_REST: SwipeState = { axis: null, dx: 0, action: null, settled: false };

/** One quiet header: colour dot, name, count; swipe left to archive. Tapping the
 *  name opens the composer with this list preselected. */
function CategoryHeader({
  name,
  color,
  count,
  canArchive,
  onAdd,
  onArchive,
}: {
  name: string;
  color: string;
  count: string | null;
  canArchive: boolean;
  onAdd: () => void;
  onArchive: () => void;
}) {
  const [swipe, setSwipe] = useState<SwipeState>(SWIPE_REST);
  const [rubber, setRubber] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const swiped = useRef(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    swiped.current = false;
    if (!canArchive || e.pointerType === "mouse") return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as Element).closest("input,textarea,select")) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setRubber(0);
    setSwipe(
      resolveSwipe({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        axis: null,
        pointerDown: true,
      }),
    );
    setDragging(true);
    // No capture yet: a plain tap must still reach the button under the finger.
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || e.pointerType === "mouse") return;
    const from = start.current;
    const next = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: axis.current,
      pointerDown: true,
    });
    if (next.axis === "y") {
      // Vertical scroll wins: hand the gesture back to the browser.
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      start.current = null;
      setDragging(false);
      setRubber(0);
      setSwipe(SWIPE_REST);
      return;
    }
    if (next.axis === "x") {
      e.preventDefault();
      axis.current = "x";
      swiped.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setRubber(rubberBand(e.clientX - from.x));
    setSwipe(next);
  }

  function cancelSwipe() {
    start.current = null;
    axis.current = null;
    setDragging(false);
    setRubber(0);
    setSwipe(SWIPE_REST);
  }

  function endSwipe(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const from = start.current;
    const locked = axis.current;
    start.current = null;
    axis.current = null;
    setDragging(false);
    setRubber(0);
    setSwipe(SWIPE_REST);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const resolved = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: locked,
      pointerDown: false,
    });
    // The shared resolver calls a leftward commit "delete"; a category header
    // has no delete gesture, so a full left swipe archives it instead.
    if (resolved.action === "delete") onArchive();
  }

  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  const displayDx = dragging ? rubber : swipe.dx;
  const width = Math.min(Math.abs(displayDx), SWIPE_MAX_PX);
  const opacity = Math.min(1, Math.abs(displayDx) / SWIPE_COMMIT_PX);

  return (
    <div
      className="module-head day-fade-in relative touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onClickCapture={onClickCapture}
    >
      {canArchive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-0 flex items-center justify-end overflow-hidden"
          style={{ width: displayDx < 0 ? width : 0, opacity: displayDx < 0 ? opacity : 0 }}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={onArchive}
            className="day-press pointer-events-auto h-11 px-3 text-[13px] text-muted"
          >
            Archive
          </button>
        </div>
      )}
      <div
        className="relative z-10 flex w-full min-w-0 items-center gap-2"
        style={{
          transform: `translateX(${displayDx}px)`,
          transition: dragging ? "none" : "transform var(--motion) var(--ease-spring)",
        }}
      >
        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${name}`}
          className="day-press min-h-11 min-w-0 truncate text-left text-[13px] font-semibold text-muted"
        >
          {name}
        </button>
        {count && <span className="shrink-0 text-[12px] tabular-nums text-faint">{count}</span>}
        <span className="flex-1" />
      </div>
    </div>
  );
}

function CategorySection({
  section,
  ghosts,
  date,
  onAdd,
  onOpenTask,
  onEditHabit,
}: {
  section: Section;
  ghosts: Habit[];
  date: ISODate;
  onAdd: (target: ComposerTargetId) => void;
  onOpenTask: (id: string) => void;
  onEditHabit: (habit: Habit) => void;
}) {
  const { actions } = useStore();
  const notify = useToast();
  const taskRows = useMotionRows(section.tasks);
  const flip = useFlipRows(taskRows.rows.map((row) => row.item.id));
  const cat = section.category;
  const color = cat ? catColor(cat.color) : "var(--accent)";
  const name = cat?.name ?? "Inbox";
  const count = section.tasks.length
    ? `${section.tasks.filter((t) => t.done).length}/${section.tasks.length}`
    : null;

  function archiveCategory() {
    if (!cat) return;
    actions.archiveCategory(cat.id, true);
    notify("Category archived", "success", {
      label: "Undo",
      onClick: () => actions.archiveCategory(cat.id, false),
      durationMs: 5000,
    });
  }

  return (
    <section aria-label={name} className="module">
      <CategoryHeader
        name={name}
        color={color}
        count={count}
        canArchive={!!cat}
        onAdd={() => onAdd(cat?.id ?? null)}
        onArchive={archiveCategory}
      />
      {cat && <CategoryGoals categoryId={cat.id} color={color} />}
      <div>
        {taskRows.rows.map(({ item: task, present, entering }) => (
          <MotionRow
            key={task.id}
            present={present}
            entering={entering}
            exitMs={taskRows.exitMs}
            innerRef={flip(task.id)}
            onExited={() => taskRows.drop(task.id)}
          >
            <TaskRow task={task} color={color} onOpen={onOpenTask} />
          </MotionRow>
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
      </div>
    </section>
  );
}

/** The day's sections live in their own keyed component so a day change starts
 *  a clean presence lifecycle: the whole list slides in, sections do not also
 *  animate as if they were new. */
function DaySectionList({
  visible,
  selected,
  onAdd,
  onOpenTask,
  onEditHabit,
}: {
  visible: readonly DaySectionRow[];
  selected: ISODate;
  onAdd: (target: ComposerTargetId) => void;
  onOpenTask: (id: string) => void;
  onEditHabit: (habit: Habit) => void;
}) {
  const items = visible.map((row) => ({ id: sectionKey(row.section), ...row }));
  const sections = useMotionRows(items);

  return (
    <div className="space-y-3.5">
      {sections.rows.map(({ item, present, entering }) => (
        <MotionRow
          key={item.id}
          present={present}
          entering={entering}
          exitMs={sections.exitMs}
          onExited={() => sections.drop(item.id)}
        >
          <CategorySection
            section={item.section}
            ghosts={item.ghosts}
            date={selected}
            onAdd={onAdd}
            onOpenTask={onOpenTask}
            onEditHabit={onEditHabit}
          />
        </MotionRow>
      ))}
    </div>
  );
}

const SUGGESTIONS = ["Study", "Work", "Health", "Personal"];

type EditorState = Habit | null;

interface ComposerState {
  /** A fresh id per open, so re-opening during the exit remounts a focused field. */
  id: number;
  target?: ComposerTargetId;
}

export function DayView({
  selected,
  onSelect,
  addSignal,
  onOpenPage,
  onManageCategories,
  active = true,
}: {
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  addSignal: number;
  onOpenPage: (page: MenuPage) => void;
  onManageCategories: () => void;
  /** False while a menu page or the task document covers the day. */
  active?: boolean;
}) {
  const { data, actions } = useStore();
  const notify = useToast();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [typing, setTyping] = useState(false);
  const [listMenu, setListMenu] = useState(false);
  const [mainMenu, setMainMenu] = useState(false);
  const [mode, setMode] = useState<CalendarMode>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches ? "month" : "week",
  );
  const [editor, setEditor] = useState<EditorState>(null);
  const editorKey = useRef(0);
  const [shownEditor, setShownEditor] = useState<EditorState>(null);
  const editorShown = usePresence(!!editor, MOTION_MS.base);
  if (editor && editor !== shownEditor) setShownEditor(editor);
  const [listMenuPos, setListMenuPos] = useState({ top: 0, left: 0 });
  const listButton = useRef<HTMLButtonElement>(null);
  const composerSeq = useRef(0);
  const mainShown = usePresence(mainMenu, MOTION_MS.fast);
  const optionsShown = usePresence(listMenu, MOTION_MS.fast);
  const lastSelected = useRef(selected);
  const direction = useRef<ReturnType<typeof daySlideDirection>>(null);
  if (lastSelected.current !== selected) {
    direction.current = daySlideDirection(lastSelected.current, selected);
    lastSelected.current = selected;
  }

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  // The Options popover lives in a portal (the sheet blurs, so a fixed child
  // would otherwise be positioned against the sheet instead of the viewport).
  useLayoutEffect(() => {
    if (!listMenu) return;
    const place = () => {
      const rect = listButton.current?.getBoundingClientRect();
      if (!rect) return;
      setListMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(window.innerWidth - 264, rect.right - 256)),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [listMenu]);

  function openComposer(target?: ComposerTargetId) {
    setComposer({ id: ++composerSeq.current, target });
  }

  // The docked add bar yields to any other text field on the page.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setTyping(isTextField(e.target));
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  const today = todayISO();

  const visible = useMemo(() => {
    const base = sectionsForDay(data.tasks, data.categories, selected, {
      showCompleted: prefs.showCompleted,
    });
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
    const rows: DaySectionRow[] = withInbox.map((section) => ({ section, ghosts: forSection(section) }));
    return partitionDaySections(rows, data.goals);
  }, [data.tasks, data.categories, data.habits, data.goals, selected, today, prefs.showCompleted]);

  const dayTasks = tasksForDay(data.tasks, selected);
  const open = dayTasks.filter((t) => !t.done).length;
  const canMoveAllToToday = selected < today && unfinishedTopLevelOn(data.tasks, selected).length > 0;
  const hasCategories = data.categories.some((c) => !c.archived && !c.deletedAt);

  // `n` (or a nav signal) opens the composer, reusing the last list.
  const lastSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== lastSignal.current) {
      lastSignal.current = addSignal;
      openComposer();
    }
  }, [addSignal]);

  useEffect(() => setComposer(null), [selected]);
  useEffect(() => {
    if (!active) setComposer(null);
  }, [active]);

  const rel =
    selected === today
      ? "Today"
      : selected === addDays(today, 1)
        ? "Tomorrow"
        : selected === addDays(today, -1)
          ? "Yesterday"
          : fromISODate(selected).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const showWeekSummary = fromISODate(selected).getDay() === 0;
  const showBar = active && !composer && !typing;

  function moveAllToToday() {
    const { moved, undo } = actions.moveUnfinishedToToday(selected);
    notify(`Moved ${moved} unfinished task${moved === 1 ? "" : "s"} to today`, "success", {
      label: "Undo",
      onClick: undo,
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-3 pt-[calc(8px+var(--safe-top))] md:px-6 lg:px-8">
        <div className="flex flex-col gap-2 lg:sticky lg:top-6">
          <header className="flex items-center justify-between gap-3 px-1 lg:contents">
            <div className="min-w-0 lg:hidden">
              <h1 className="truncate text-[20px] font-bold leading-tight tracking-tight">{formatDayTitle(selected)}</h1>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{rel}</div>
            </div>
            <div className="relative flex shrink-0 items-center gap-2 lg:fixed lg:right-6 lg:top-5 lg:z-30">
              {selected !== today && (
                <button
                  onClick={() => onSelect(today)}
                  className="day-press min-h-11 px-2 text-[13px] text-muted hover:text-ink"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => setMainMenu((v) => !v)}
                aria-label="Menu"
                aria-expanded={mainMenu}
                aria-haspopup="menu"
                className="day-press flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
              >
                <Menu size={20} />
              </button>
              {mainShown.mounted && (
                <>
                  <button
                    aria-label="Close menu"
                    className={`day-backdrop fixed inset-0 z-30 cursor-default ${mainShown.closing ? "closing" : ""}`}
                    onClick={() => setMainMenu(false)}
                  />
                  <div
                    role="menu"
                    className={`day-pop absolute right-0 top-12 z-40 w-44 origin-top-right overflow-hidden border border-line bg-[var(--pop)] ${
                      mainShown.closing ? "closing" : ""
                    }`}
                  >
                    {MENU_ITEMS.map(([page, label]) => (
                      <button
                        key={page}
                        role="menuitem"
                        onClick={() => {
                          setMainMenu(false);
                          onOpenPage(page);
                        }}
                        className="day-press min-h-11 w-full px-4 text-left text-[13px] text-ink hover:text-accent"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </header>

          <Calendar selected={selected} onSelect={onSelect} mode={mode} onModeChange={setMode} />
        </div>
      </div>

      <div className="sheet mt-2 flex-1">
        <div className="mx-auto w-full max-w-[560px] px-3 pb-[calc(104px+var(--safe-bottom))] pt-3 md:px-6 lg:max-w-[1200px] lg:px-8">
          <div
            key={selected}
            className={
              direction.current === "next"
                ? "day-list-next"
                : direction.current === "prev"
                  ? "day-list-prev"
                  : undefined
            }
          >
            <div className="day-fade-in relative mb-1.5 flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <div className="text-[12px] text-muted">
                  {dayTasks.length === 0
                    ? "Nothing planned"
                    : open === 0
                      ? "All done. Nice work."
                      : `${open} left of ${dayTasks.length}`}
                </div>
                {canMoveAllToToday && (
                  <button
                    onClick={moveAllToToday}
                    className="day-press min-h-11 px-1 text-[13px] text-muted hover:text-ink"
                  >
                    Move all to today
                  </button>
                )}
              </div>
              {hasCategories && (
                <>
                  <button
                    ref={listButton}
                    onClick={() => setListMenu((v) => !v)}
                    aria-expanded={listMenu}
                    aria-label="List menu"
                    title="List menu"
                    className="day-press min-h-11 px-2 text-[12px] text-faint hover:text-ink"
                  >
                    Options
                  </button>
                  {optionsShown.mounted &&
                    createPortal(
                      <>
                        <button
                          aria-label="Close list menu"
                          className={`day-backdrop fixed inset-0 z-10 cursor-default ${optionsShown.closing ? "closing" : ""}`}
                          onClick={() => setListMenu(false)}
                        />
                        <div
                          style={{ top: listMenuPos.top, left: listMenuPos.left }}
                          className={`day-pop fixed z-20 w-64 origin-top-right border border-line bg-[var(--pop)] py-1 ${
                            optionsShown.closing ? "closing" : ""
                          }`}
                        >
                          <button
                            onClick={() => setPrefs((p) => ({ ...p, showCompleted: !p.showCompleted }))}
                            aria-pressed={prefs.showCompleted}
                            className="day-press flex min-h-11 w-full items-center justify-between px-3 text-left text-[13px] hover:text-ink"
                          >
                            Show completed
                            <span className="ml-3 text-[12px] text-faint">{prefs.showCompleted ? "On" : "Off"}</span>
                          </button>
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
                              className="day-press min-h-11 w-full px-3 text-left text-[13px] hover:text-ink"
                            >
                              Move unfinished to tomorrow
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setListMenu(false);
                              onManageCategories();
                            }}
                            className="day-press min-h-11 w-full border-t border-line px-3 text-left text-[13px] hover:text-ink"
                          >
                            Reorder categories
                          </button>
                        </div>
                      </>,
                      document.body,
                    )}
                </>
              )}
            </div>

            {!hasCategories && (
              <div className="day-fade-in">
                <h2 className="text-[16px] font-semibold">Start with a few categories</h2>
                <p className="mt-1 max-w-[19rem] text-[13px] leading-relaxed text-muted">
                  Categories group your tasks each day. Pick some to begin, change them any time.
                </p>
                <div className="mt-3 flex flex-col items-start">
                  {SUGGESTIONS.map((name, i) => (
                    <button
                      key={name}
                      onClick={() => actions.addCategory(name, CATEGORY_COLORS[[8, 4, 0, 6][i]])}
                      className="day-press flex min-h-11 items-center gap-1 text-[13px] text-muted hover:text-ink"
                    >
                      <span aria-hidden>+</span> {name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={onManageCategories}
                  className="day-press mt-1 min-h-11 px-1 text-[13px] text-muted underline underline-offset-4 hover:text-ink"
                >
                  Or create your own
                </button>
              </div>
            )}

            <DaySectionList
              visible={visible}
              selected={selected}
              onAdd={(target) => openComposer(target)}
              onOpenTask={(id) => {
                window.location.hash = `#/task/${id}`;
              }}
              onEditHabit={(habit) => {
                editorKey.current += 1;
                setEditor(habit);
              }}
            />
          </div>

          <DeadlinesCard date={selected} />

          {showWeekSummary && (
            <div className="mt-3">
              <WeekSummaryCard start={startOfWeek(selected)} />
            </div>
          )}

          <div className="mt-3">
            <CalorieBar date={selected} />
          </div>
        </div>
      </div>

      {showBar && (
        <div className="add-dock">
          <div className="add-dock-inner">
            <button
              type="button"
              aria-label="Add a task"
              onClick={() => openComposer()}
              className="add-task-button day-press"
            >
              Add a task
            </button>
          </div>
        </div>
      )}

      {composer && (
        <Composer
          key={composer.id}
          date={selected}
          initialTarget={composer.target}
          onClose={() => setComposer(null)}
        />
      )}

      {editorShown.mounted && shownEditor && (
        <HabitEditor
          key={editorKey.current}
          habit={shownEditor}
          date={selected < today ? today : selected}
          closing={editorShown.closing}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
