import { useEffect, useRef, useState } from "react";
import { Flame, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { dayKcal, entriesForDay, onGoal } from "../domain/calories";
import type { ISODate } from "../domain/dates";
import { useStore } from "../state/store";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Slim kcal bar under the calendar: tap + to add, tap the total to list entries. */
export function CalorieBar({ date }: { date: ISODate }) {
  const { data, actions } = useStore();
  const goal = data.settings.dailyCalorieGoal;
  const entries = entriesForDay(data.calories, date);
  const total = dayKcal(data.calories, date);
  const [mode, setMode] = useState<"idle" | "add" | "list">("idle");
  const [kcal, setKcal] = useState("");
  const [label, setLabel] = useState("");
  const kcalRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMode("idle"), [date]);
  useEffect(() => {
    if (mode === "add") kcalRef.current?.focus();
  }, [mode]);

  const pct = goal > 0 ? Math.min(total / goal, 1) : 0;
  const good = onGoal(total, goal);
  const over = goal > 0 && total > goal * 1.1;
  const barColor = over ? "var(--warn)" : good ? "var(--ok)" : "var(--accent)";

  function submit() {
    const n = Number(kcal.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    actions.addCalorie(date, n, label);
    setKcal("");
    setLabel("");
    kcalRef.current?.focus();
  }

  return (
    <section aria-label="Calories" className="module !p-0">
      <div className="overflow-hidden rounded-[var(--r)]">
        <div className="flex h-16 items-center pl-2 pr-3">
          <button
            onClick={() => setMode((m) => (m === "list" ? "idle" : "list"))}
            aria-expanded={mode === "list"}
            aria-label="Show calorie entries"
            className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl pl-3 text-left transition-colors hover:bg-ink/[0.04]"
          >
            {over ? (
              <TriangleAlert size={19} className="text-amber" strokeWidth={2.2} aria-label="Over goal" />
            ) : (
              <Flame size={19} className={total > 0 ? "text-amber" : "text-faint"} strokeWidth={2.2} />
            )}
            <span className="text-[20px] font-semibold tabular-nums">{fmt(total)}</span>
            <span className="text-[15px] font-medium tabular-nums text-faint">
              / {fmt(goal)} kcal
            </span>
          </button>
          <button
            onClick={() => setMode((m) => (m === "add" ? "idle" : "add"))}
            aria-label={mode === "add" ? "Close calorie input" : "Add calories"}
            className="mod-btn !min-w-10 !px-0 !bg-ink/[0.07] !text-ink"
          >
            <Plus
              size={20}
              strokeWidth={2.5}
              className="transition-transform duration-200"
              style={{ transform: mode === "add" ? "rotate(45deg)" : undefined }}
            />
          </button>
        </div>
        <div className="h-[4px] w-full bg-ink/[0.07]">
          <div
            className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
            style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
          />
        </div>

        {mode === "add" && (
          <div className="animate-row flex items-center gap-2 px-3 py-2.5">
            <input
              ref={kcalRef}
              value={kcal}
              onChange={(e) => setKcal(e.target.value.replace(/[^\d,]/g, ""))}
              inputMode="numeric"
              placeholder="kcal"
              aria-label="Calories"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                else if (e.key === "Escape") {
                  e.stopPropagation();
                  setMode("idle");
                }
              }}
              className="h-11 w-[92px] rounded-xl bg-canvas/50 px-3 text-[16px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-faint focus:ring-1 focus:ring-ink/30"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              aria-label="Label"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                else if (e.key === "Escape") {
                  e.stopPropagation();
                  setMode("idle");
                }
              }}
              className="h-11 min-w-0 flex-1 rounded-xl bg-canvas/50 px-3 text-[16px] outline-none placeholder:text-faint focus:ring-1 focus:ring-ink/30"
            />
            <button
              onClick={submit}
              disabled={!kcal}
              className="h-11 rounded-xl bg-[var(--accent)] px-4 text-[15px] font-semibold text-accent-ink transition-opacity active:scale-95 disabled:opacity-30"
            >
              Add
            </button>
          </div>
        )}

        {mode === "list" && (
          <div className="animate-row border-t border-line px-3 py-1.5">
            {entries.length === 0 ? (
              <p className="py-3 text-center text-[14px] text-faint">Nothing logged for this day</p>
            ) : (
              <ul>
                {entries.map((e) => (
                  <li key={e.id} className="flex min-h-[44px] items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[16px] text-muted">
                      {e.label || "Entry"}
                    </span>
                    <span className="text-[16px] font-semibold tabular-nums">{fmt(e.kcal)}</span>
                    <button
                      onClick={() => actions.deleteCalorie(e.id)}
                      aria-label={`Delete ${e.label || "entry"}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-ink/10 hover:text-rose active:scale-90"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pb-1">
              <button
                onClick={() => setMode("idle")}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-faint hover:text-ink"
              >
                <X size={12} /> Close
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
