import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { dayKcal, entriesForDay, entryTimeLabel } from "../domain/calories";
import type { ISODate } from "../domain/dates";
import { healthLine } from "../lib/health";
import { useNavCommand } from "../state/deeplink";
import { useHealth } from "../state/health";
import { useStore } from "../state/store";
import { resolveInlineSave } from "./inlineSave";

const fmt = (n: number) => n.toLocaleString("en-US");

/** One flat row: total / goal, a plain "+", and a 2px hairline. No flame, no tiles, no warning icon. */
export function CalorieBar({ date }: { date: ISODate }) {
  const { data, actions } = useStore();
  const health = useHealth();
  const nav = useNavCommand();
  const goal = data.settings.dailyCalorieGoal;
  const entries = entriesForDay(data.calories, date);
  const total = dayKcal(data.calories, date);
  const burnedLine = healthLine(health.day(date));
  const [mode, setMode] = useState<"idle" | "add" | "list">("idle");
  const [kcal, setKcal] = useState("");
  const kcalRef = useRef<HTMLInputElement>(null);
  const blocked = useRef(false);
  const lastNav = useRef(0);

  useEffect(() => setMode("idle"), [date]);
  useEffect(() => {
    if (!nav.seq || nav.seq === lastNav.current || date !== nav.date) return;
    lastNav.current = nav.seq;
    if (nav.openCalories) {
      blocked.current = false;
      setKcal("");
      setMode("add");
    }
  }, [nav, date]);
  useEffect(() => {
    if (mode !== "add") return;
    kcalRef.current?.focus();
    kcalRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [mode]);

  const pct = goal > 0 ? Math.min(total / goal, 1) : 0;
  const over = goal > 0 && total > goal;

  function commit() {
    const attempt = resolveInlineSave(kcal, blocked.current);
    if (!attempt.value) return;
    const n = Number(attempt.value.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    blocked.current = true;
    actions.addCalorie(date, n);
    setKcal("");
  }

  /** Cancel must win over the blur that a tap on "x" or the keyboard's Escape would otherwise cause. */
  function discard() {
    blocked.current = true;
    setKcal("");
    setMode("idle");
  }

  return (
    <section aria-label="Calories" className="!p-0">
      <div className="flex min-h-12 items-center pl-0.5 pr-1">
        <button
          onClick={() => setMode((m) => (m === "list" ? "idle" : "list"))}
          aria-expanded={mode === "list"}
          aria-label="Show calorie entries"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[15px] font-semibold tabular-nums">{fmt(total)}</span>
          <span className="text-[13px] tabular-nums text-faint">{` / ${fmt(goal)} kcal`}</span>
        </button>
        <button
          onPointerDown={(e) => {
            // The "x" closes the input: don't let the blur it causes save the draft first.
            if (mode === "add") e.preventDefault();
          }}
          onClick={() => {
            if (mode === "add") discard();
            else {
              blocked.current = false;
              setKcal("");
              setMode("add");
            }
          }}
          aria-label={mode === "add" ? "Close calorie input" : "Add calories"}
          className="flex h-11 w-11 items-center justify-center text-ink"
        >
          <Plus
            size={18}
            strokeWidth={2}
            className="transition-transform duration-150"
            style={{ transform: mode === "add" ? "rotate(45deg)" : undefined }}
          />
        </button>
      </div>

      <div aria-hidden className="h-[2px] w-full bg-line">
        <div
          className={`h-full transition-[width,background-color] duration-500 ease-out ${over ? "bg-amber" : "bg-muted"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {burnedLine && (
        <p className="break-words py-1.5 text-[12px] leading-relaxed text-faint">{burnedLine}</p>
      )}

      {mode === "add" && (
        <div className="animate-row flex items-center py-1">
          <input
            ref={kcalRef}
            value={kcal}
            onChange={(e) => {
              blocked.current = false;
              setKcal(e.target.value.replace(/[^\d,]/g, ""));
            }}
            onBlur={() => {
              // The iOS "Done" key only blurs: save, then close the field.
              commit();
              setMode((m) => (m === "add" ? "idle" : m));
            }}
            inputMode="numeric"
            placeholder="kcal"
            aria-label="Calories"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                discard();
              }
            }}
            className="h-11 w-[104px] bg-transparent text-[16px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-faint"
          />
        </div>
      )}

      {mode === "list" && (
        <div className="animate-row border-t border-line pt-1">
          {entries.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-faint">Nothing logged for this day</p>
          ) : (
            <ul>
              {entries.map((e) => (
                <li key={e.id} className="flex min-h-11 items-center gap-3 border-b border-line">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-muted">
                    {entryTimeLabel(e)}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums">{fmt(e.kcal)}</span>
                  <button
                    onClick={() => actions.deleteCalorie(e.id)}
                    aria-label={`Delete entry at ${entryTimeLabel(e)}`}
                    className="min-h-11 px-1 text-[12px] text-faint hover:text-ink"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setMode("idle")}
              className="min-h-11 px-2 text-[12px] text-faint hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
