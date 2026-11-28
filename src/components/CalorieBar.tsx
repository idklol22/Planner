import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { dayKcal, dayProtein, entriesForDay, entryTimeLabel } from "../domain/calories";
import type { ISODate } from "../domain/dates";
import type { CalorieEntry } from "../domain/model";
import { healthLine } from "../lib/health";
import { prefersReducedMotion, MOTION_MS, usePresence } from "../lib/motion";
import { useNavCommand } from "../state/deeplink";
import { useHealth } from "../state/health";
import { useStore } from "../state/store";
import { useCount, useEntryRows, type EntryRow } from "./calorieMotion";
import { resolveInlineSave } from "./inlineSave";

const fmt = (n: number) => n.toLocaleString("en-US");
type Field = "kcal" | "protein";

function EntryRowView({
  row,
  onRemove,
}: {
  row: EntryRow<CalorieEntry>;
  onRemove: (id: string) => void;
}) {
  const presence = usePresence(!row.leaving, MOTION_MS.base);
  if (!presence.mounted) return null;
  const e = row.item;
  return (
    <li className="cal-collapse cal-entry" data-open={!presence.closing}>
      <div className="cal-collapse-inner">
        <div className="flex min-h-11 items-center gap-3 border-b border-line">
          <span className="min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-muted">
            {entryTimeLabel(e)}
          </span>
          {e.kcal > 0 && (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums">
              {fmt(e.kcal)} kcal
            </span>
          )}
          {e.protein !== undefined && e.protein > 0 && (
            <span className="shrink-0 text-[13px] tabular-nums text-muted">
              {fmt(e.protein)} g
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(e.id)}
            aria-label={`Delete entry at ${entryTimeLabel(e)}`}
            className="cal-press min-h-11 shrink-0 px-1 text-[12px] text-faint hover:text-ink"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

/** Two flat meters side by side; one shared input row opens under them, then the
 *  day's entries. No tiles, icons or separate "+" button. */
export function CalorieBar({ date }: { date: ISODate }) {
  const { data, actions } = useStore();
  const health = useHealth();
  const nav = useNavCommand();
  const goal = data.settings.dailyCalorieGoal;
  const proteinGoal = data.settings.dailyProteinGoal ?? 0;
  const entries = entriesForDay(data.calories, date);
  const total = dayKcal(data.calories, date);
  const proteinTotal = dayProtein(data.calories, date);
  const burnedLine = healthLine(health.day(date));
  const [mode, setMode] = useState<"idle" | "add">("idle");
  const [field, setField] = useState<Field>("kcal");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const kcalRef = useRef<HTMLInputElement>(null);
  const proteinRef = useRef<HTMLInputElement>(null);
  /** An Enter (or a successful commit) must not be repeated by the blur that follows. */
  const blocked = useRef(false);
  const lastNav = useRef(0);

  // Counts restart from wherever an interrupted count stopped; they ignore re-renders.
  const shownTotal = useCount(total);
  const shownProtein = useCount(proteinTotal, 1);

  const entrySig = entries.map((e) => `${e.id}:${e.kcal}:${e.protein ?? ""}`).join("|");
  const rows = useEntryRows(entries, entrySig);
  const list = usePresence(mode === "add" && entries.length > 0, MOTION_MS.base);

  /** The inputs stay mounted while collapsed, so leaving the form must dismiss
   *  the keyboard explicitly. The blur is blocked from committing a draft. */
  function releaseFocus() {
    const active = document.activeElement;
    if (active === kcalRef.current || active === proteinRef.current) {
      blocked.current = true;
      (active as HTMLElement).blur();
    }
  }

  useEffect(() => {
    releaseFocus();
    setMode("idle");
    setKcal("");
    setProtein("");
  }, [date]);

  useEffect(() => {
    if (!nav.seq || nav.seq === lastNav.current || date !== nav.date) return;
    lastNav.current = nav.seq;
    if (nav.openCalories) {
      blocked.current = false;
      setKcal("");
      setProtein("");
      setField("kcal");
      setMode("add");
    }
  }, [nav, date]);

  useEffect(() => {
    if (mode !== "add") return;
    const ref = field === "protein" ? proteinRef : kcalRef;
    ref.current?.focus();
    ref.current?.scrollIntoView?.({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [mode, field]);

  const pct = goal > 0 ? Math.min(total / goal, 1) : 0;
  const over = goal > 0 && total > goal;
  const proteinPct = proteinGoal > 0 ? Math.min(proteinTotal / proteinGoal, 1) : 0;

  /** Save at most one entry for the current draft. `close` is false for Enter,
   *  which commits but leaves the row open for the next entry. */
  function commit(close: boolean) {
    const draft = [kcal, protein].filter(Boolean).join("|");
    const attempt = resolveInlineSave(draft, blocked.current);
    // Keep the block until the draft actually changes, so an Enter followed by
    // the keyboard's blur cannot add the same entry twice.
    blocked.current = attempt.blocked;
    if (attempt.value) {
      const k = Number(kcal.replace(/,/g, ""));
      const p = Number(protein);
      const kcalValue = Number.isFinite(k) && k > 0 ? k : 0;
      const proteinValue = Number.isFinite(p) && p > 0 ? p : 0;
      if (kcalValue > 0 || proteinValue > 0) {
        actions.addCalorie(date, kcalValue, proteinValue > 0 ? proteinValue : undefined);
      }
      setKcal("");
      setProtein("");
    }
    if (close) setMode("idle");
  }

  /** Cancel must win over the blur a tap on it would otherwise cause. */
  function discard() {
    blocked.current = true;
    releaseFocus();
    setKcal("");
    setProtein("");
    setMode("idle");
  }

  function open(next: Field) {
    if (mode === "add") {
      // The form stays mounted, so switching fields can focus inside the same tap.
      (next === "protein" ? proteinRef : kcalRef).current?.focus();
    } else {
      blocked.current = false;
      setKcal("");
      setProtein("");
    }
    setField(next);
    setMode("add");
    // The inputs are always in the DOM (the row only collapses), so the keyboard
    // still opens for this gesture instead of waiting for an animation frame.
    (next === "protein" ? proteinRef : kcalRef).current?.focus();
  }

  /** Moving between the two inputs is not leaving the form: no save, no close. */
  function leaving(e: FocusEvent<HTMLInputElement>) {
    const to = e.relatedTarget;
    if (to === kcalRef.current || to === proteinRef.current) return;
    commit(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      discard();
    }
  }

  return (
    <section aria-label="Calories" className="!p-0">
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => open("kcal")}
          onPointerDown={(e) => {
            if (mode === "add") e.preventDefault();
          }}
          aria-label="Log calories"
          className="cal-press min-h-11 min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[15px] font-semibold tabular-nums">
            {fmt(shownTotal)}
            <span className="text-[13px] font-normal text-faint">{` / ${fmt(goal)} kcal`}</span>
          </span>
          <span aria-hidden className="mt-1 block h-[2px] w-full bg-line">
            <span
              className={`cal-meter-fill block h-full w-full origin-left ${over ? "bg-amber" : "bg-muted"}`}
              style={{ transform: `scaleX(${pct})` }}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={() => open("protein")}
          onPointerDown={(e) => {
            if (mode === "add") e.preventDefault();
          }}
          aria-label="Log protein"
          className="cal-press min-h-11 min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[15px] font-semibold tabular-nums">
            {proteinGoal > 0
              ? `${fmt(shownProtein)} / ${fmt(proteinGoal)} g protein`
              : `${fmt(shownProtein)} g protein`}
          </span>
          <span aria-hidden className="mt-1 block h-[2px] w-full bg-line">
            <span
              className="cal-meter-fill block h-full w-full origin-left bg-muted"
              style={{ transform: `scaleX(${proteinPct})` }}
            />
          </span>
        </button>
      </div>

      <div className="cal-collapse" data-open={mode === "add"}>
        <div className="cal-collapse-inner">
          <div className="flex items-center gap-3 py-1">
            <input
              ref={kcalRef}
              value={kcal}
              onChange={(e) => {
                blocked.current = false;
                setKcal(e.target.value.replace(/[^\d,]/g, ""));
              }}
              onBlur={leaving}
              onKeyDown={onKeyDown}
              inputMode="numeric"
              placeholder="kcal"
              aria-label="kcal"
              tabIndex={mode === "add" ? 0 : -1}
              className="h-11 min-w-0 flex-1 border-b border-line-2 bg-transparent text-[16px] font-semibold tabular-nums !outline-none placeholder:font-normal placeholder:text-faint focus:border-ink"
            />
            <input
              ref={proteinRef}
              value={protein}
              onChange={(e) => {
                blocked.current = false;
                const clean = e.target.value.replace(/[^\d.]/g, "");
                const [whole, ...fraction] = clean.split(".");
                setProtein(fraction.length ? `${whole}.${fraction.join("")}` : whole);
              }}
              onBlur={leaving}
              onKeyDown={onKeyDown}
              inputMode="decimal"
              placeholder="protein g"
              aria-label="protein g"
              tabIndex={mode === "add" ? 0 : -1}
              className="h-11 min-w-0 flex-1 border-b border-line-2 bg-transparent text-[16px] font-semibold tabular-nums !outline-none placeholder:font-normal placeholder:text-faint focus:border-ink"
            />
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={discard}
              className="cal-press min-h-11 shrink-0 px-1 text-[12px] text-faint hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {list.mounted && (
        <div className="cal-collapse" data-open={!list.closing}>
          <div className="cal-collapse-inner">
            {/* Tapping "Remove" must not blur the form first, which would close this list. */}
            <ul onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
              {rows.map((row) => (
                <EntryRowView key={row.item.id} row={row} onRemove={actions.deleteCalorie} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {burnedLine && (
        <p className="break-words py-1.5 text-[12px] leading-relaxed text-faint">{burnedLine}</p>
      )}
    </section>
  );
}
