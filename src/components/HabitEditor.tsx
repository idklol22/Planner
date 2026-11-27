import { useEffect, useState } from "react";
import { Flame, Trash2 } from "lucide-react";
import type { ISODate } from "../domain/dates";
import type { Habit } from "../domain/model";
import { activeCategories } from "../domain/tasks";
import { useStore } from "../state/store";

// Monday first, values are JS weekdays (0 = Sunday).
const DAYS: [string, number][] = [
  ["M", 1],
  ["T", 2],
  ["W", 3],
  ["T", 4],
  ["F", 5],
  ["S", 6],
  ["S", 0],
];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LABEL = "mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-faint";
const FIELD =
  "h-11 rounded-xl bg-canvas px-3 text-[16px] text-ink outline-none focus:ring-1 focus:ring-ink/30";

/** Bottom sheet on phone, centred card on desktop. Creates or edits a habit. */
export function HabitEditor({
  habit,
  categoryId,
  date,
  onClose,
}: {
  habit?: Habit;
  categoryId?: string | null;
  date: ISODate;
  onClose: () => void;
}) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [cat, setCat] = useState<string>(habit?.categoryId ?? categoryId ?? "");
  const [start, setStart] = useState(habit?.startDate ?? date);
  const [forever, setForever] = useState(habit ? habit.endDate === null : true);
  const [end, setEnd] = useState(habit?.endDate ?? date);
  const [days, setDays] = useState<number[]>(habit?.weekdays ?? []);
  const categories = activeCategories(data.categories);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = title.trim().length > 0 && (forever || end >= start);

  function save() {
    if (!valid) return;
    const input = {
      title: title.trim(),
      categoryId: cat || null,
      startDate: start,
      endDate: forever ? null : end,
      weekdays: days,
    };
    if (habit) actions.updateHabit(habit.id, input);
    else actions.addHabit(input);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default bg-scrim backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-label={habit ? "Edit habit" : "New habit"}
        className="animate-sheet-up glass-panel relative max-h-[92dvh] w-full max-w-[460px] overflow-y-auto overscroll-contain px-5 pb-[calc(20px+var(--safe-bottom))] pt-[calc(12px+var(--safe-top))] md:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink/20 md:hidden" />
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas">
            <Flame size={17} className="text-amber" />
          </span>
          <h2 className="text-[19px] font-bold tracking-tight">{habit ? "Edit habit" : "New habit"}</h2>
        </div>

        <label className={LABEL}>Habit</label>
        <input
          autoFocus={!habit}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. Stretch for 10 minutes"
          className={`${FIELD} mb-4 w-full`}
        />

        <label className={LABEL}>Category</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${FIELD} mb-4 w-full`}>
          <option value="">Inbox</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className={LABEL}>Repeats</label>
        <div className="mb-2 flex justify-between gap-1.5">
          {DAYS.map(([label, value], i) => {
            const on = days.includes(value);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[i]}
                onClick={() => setDays((d) => (on ? d.filter((x) => x !== value) : [...d, value]))}
                className={`flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-semibold transition-all active:scale-90 ${
                  on ? "bg-accent text-accent-ink" : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mb-4 text-[12px] text-faint">
          {days.length === 0 || days.length === 7 ? "Every day" : "Only on the days selected"}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Starts</label>
            <input
              type="date"
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              className={`${FIELD} w-full`}
            />
          </div>
          <div>
            <label className={LABEL}>Ends</label>
            <div className="flex h-11 rounded-xl bg-canvas p-0.5">
              {([true, false] as const).map((f) => (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setForever(f)}
                  className={`flex-1 rounded-[10px] text-[13px] font-semibold transition-colors ${
                    forever === f ? "bg-accent text-accent-ink" : "text-muted"
                  }`}
                >
                  {f ? "Never" : "On date"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!forever && (
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => e.target.value && setEnd(e.target.value)}
            className={`${FIELD} animate-row mb-4 w-full`}
          />
        )}

        <div className="mt-2 flex items-center gap-2">
          {habit && (
            <button
              onClick={() => {
                actions.archiveHabit(habit.id, true);
                onClose();
              }}
              aria-label="Archive habit"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-rose transition-transform active:scale-90"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="h-12 flex-1 rounded-full bg-canvas text-[15px] font-semibold text-muted transition-transform active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="h-12 flex-[1.4] rounded-full bg-accent text-[15px] font-semibold text-accent-ink transition-all active:scale-95 disabled:opacity-30"
          >
            {habit ? "Save" : "Add habit"}
          </button>
        </div>
      </div>
    </div>
  );
}
