import { useEffect, useState } from "react";
import type { ISODate } from "../domain/dates";
import type { Habit } from "../domain/model";
import { activeCategories } from "../domain/tasks";
import { useStore } from "../state/store";
import { Collapse } from "./Collapse";

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

const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint";
const FIELD = "h-11 w-full border-b border-line bg-transparent text-[16px] text-ink outline-none";

/** Bottom sheet on phone, plain sheet on desktop. Creates or edits a habit. */
export function HabitEditor({
  habit,
  categoryId,
  date,
  closing = false,
  onClose,
}: {
  habit?: Habit;
  categoryId?: string | null;
  date: ISODate;
  /** Set by the owner while the sheet is animating down (usePresence). */
  closing?: boolean;
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
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClose}
        className={`panel-backdrop absolute inset-0 cursor-default bg-scrim ${closing ? "is-closing" : ""}`}
      />
      <div
        role="dialog"
        aria-label={habit ? "Edit habit" : "New habit"}
        className={`panel-sheet relative max-h-[92dvh] w-full max-w-[460px] overflow-y-auto overscroll-contain bg-canvas px-5 pb-[calc(20px+var(--safe-bottom))] pt-[calc(12px+var(--safe-top))] md:pb-5 ${closing ? "is-closing" : ""}`}
      >
        <h2 className="mb-4 text-[15px] font-semibold tracking-tight">{habit ? "Edit habit" : "New habit"}</h2>

        <label className={LABEL}>Habit</label>
        <input
          autoFocus={!habit}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. Stretch for 10 minutes"
          className={`${FIELD} mb-4`}
        />

        <label className={LABEL}>Category</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${FIELD} mb-4`}>
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
                className={`ui-press flex h-11 flex-1 items-center justify-center border-b-2 text-[13px] font-semibold ${
                  on ? "border-accent text-accent" : "border-line text-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mb-4 text-[11.5px] text-faint">
          {days.length === 0 || days.length === 7 ? "Every day" : "Only on the days selected"}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Starts</label>
            <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Ends</label>
            <div className="flex h-11 items-center gap-3">
              {([true, false] as const).map((f) => (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setForever(f)}
                  className={`ui-press min-h-11 text-[12px] font-semibold ${
                    forever === f ? "text-accent underline underline-offset-4" : "text-muted"
                  }`}
                >
                  {f ? "Never" : "On date"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Collapse open={!forever}>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => e.target.value && setEnd(e.target.value)}
            className={`${FIELD} mb-4`}
          />
        </Collapse>

        <div className="mt-2 flex items-center gap-4">
          {habit && (
            <button
              onClick={() => {
                actions.archiveHabit(habit.id, true);
                onClose();
              }}
              aria-label="Archive habit"
              className="ui-press min-h-11 text-[13px] text-rose"
            >
              Archive
            </button>
          )}
          <span className="flex-1" />
          <button onClick={onClose} className="ui-press min-h-11 px-2 text-[13px] text-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="ui-press min-h-11 px-2 text-[13px] font-semibold text-accent disabled:opacity-40"
          >
            {habit ? "Save" : "Add habit"}
          </button>
        </div>
      </div>
    </div>
  );
}
