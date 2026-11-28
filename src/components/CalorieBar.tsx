import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { dayKcal, dayProtein, entriesForDay, entryTimeLabel } from "../domain/calories";
import type { ISODate } from "../domain/dates";
import type { CalorieEntry } from "../domain/model";
import { healthLine } from "../lib/health";
import { keyboardOpenFromHeight } from "../lib/keyboard";
import { prefersReducedMotion, MOTION_MS, usePresence } from "../lib/motion";
import { useNavCommand } from "../state/deeplink";
import { useHealth } from "../state/health";
import { useStore } from "../state/store";
import { calorieOutsideTapDecision } from "./calorieOutsideTap";
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
            data-calorie-keep-tap
            data-inline-add-keep-tap
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
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
  /** The click following a dismissal pointerdown is swallowed only once. */
  const suppressClick = useRef(false);
  /** Height-only keyboard signal: WKWebView's offsetTop lies while scrolling. */
  const keyboardUp = useRef(false);
  const lastNav = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const dateRef = useRef(date);
  dateRef.current = date;
  const prevDate = useRef(date);
  const draftRef = useRef({ kcal, protein });
  draftRef.current = { kcal, protein };

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
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => {
      keyboardUp.current = keyboardOpenFromHeight(window.innerHeight, viewport.height);
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  useEffect(() => {
    // A draft belongs to the day it was typed for: save it before the inputs
    // are cleared, even when WKWebView never blurred them on the day change.
    if (prevDate.current !== date) {
      suppressClick.current = false;
      commitFor(prevDate.current, false);
      prevDate.current = date;
    }
    releaseFocus();
    setMode("idle");
    setKcal("");
    setProtein("");
  }, [date]);

  useEffect(() => {
    if (!nav.seq || nav.seq === lastNav.current || date !== nav.date) return;
    lastNav.current = nav.seq;
    if (nav.openCalories) {
      suppressClick.current = false;
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
   *  which commits but leaves the row open for the next entry. `targetDate` is
   *  explicit so a day change still saves to the day the text was typed for. */
  function commitFor(targetDate: ISODate, close: boolean) {
    const { kcal: kText, protein: pText } = draftRef.current;
    const draft = [kText, pText].filter(Boolean).join("|");
    const attempt = resolveInlineSave(draft, blocked.current);
    // Keep the block until the draft actually changes, so an Enter followed by
    // the keyboard's blur cannot add the same entry twice.
    blocked.current = attempt.blocked;
    if (attempt.value) {
      const k = Number(kText.replace(/,/g, ""));
      const p = Number(pText);
      const kcalValue = Number.isFinite(k) && k > 0 ? k : 0;
      const proteinValue = Number.isFinite(p) && p > 0 ? p : 0;
      if (kcalValue > 0 || proteinValue > 0) {
        actions.addCalorie(targetDate, kcalValue, proteinValue > 0 ? proteinValue : undefined);
      }
      setKcal("");
      setProtein("");
    }
    if (close) setMode("idle");
  }

  function commit(close: boolean) {
    commitFor(dateRef.current, close);
  }

  // iOS often does not blur a field when the user taps blank space above the
  // keyboard. Commit on that pointerdown (and on backgrounding) instead of
  // waiting for a blur that may never come. The listeners live here so they
  // outlive the collapsed form. A dismissal also swallows the click that
  // follows, so the tap only dismisses the form — exactly like the task field.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      // Moving between the form's fields is not leaving it. Clear any stale
      // suppression from a scroll that produced no click on the way through.
      if (el?.closest?.("[data-calorie-field]")) {
        suppressClick.current = false;
        return;
      }
      const keepTap = !!el?.closest?.("[data-calorie-keep-tap], [data-inline-add-keep-tap]");
      const active = document.activeElement;
      const focused = active === kcalRef.current || active === proteinRef.current;
      const decision = calorieOutsideTapDecision(
        modeRef.current === "add",
        !!(draftRef.current.kcal || draftRef.current.protein),
        keyboardUp.current || focused,
        keepTap,
      );
      // Overwrite on every pointerdown: a touch-scroll has no click, so its
      // suppression must not be left to swallow the next real tap's click.
      suppressClick.current = decision.suppress;
      if (!decision.commit) return;
      // Keep-tap controls save with close:false so the row stays put until
      // their own click fires; a plain outside tap closes it right away.
      commitFor(dateRef.current, decision.close);
      if (decision.blur) releaseFocus();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onExit = () => {
      suppressClick.current = false;
      if (modeRef.current !== "add") return;
      commitFor(dateRef.current, true);
      releaseFocus();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onExit();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onExit);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onExit);
    };
  }, []);

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
          data-calorie-keep-tap
          data-inline-add-keep-tap
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
          data-calorie-keep-tap
          data-inline-add-keep-tap
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
              data-calorie-field
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
              data-calorie-field
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
              data-calorie-keep-tap
              data-inline-add-keep-tap
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
            <ul>
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
