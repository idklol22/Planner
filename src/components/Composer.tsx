import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from "react";
import { INBOX_KEY } from "../domain/daySections";
import type { ISODate } from "../domain/dates";
import { activeCategories } from "../domain/tasks";
import { useKeyboardInset } from "../lib/keyboard";
import { MOTION_MS, usePresence } from "../lib/motion";
import { useStore } from "../state/store";
import { catColor } from "../theme/store";

export type ComposerKind = "task" | "goal";
/** `null` is Inbox: a task has no category, and a goal cannot go there. */
export type ComposerTargetId = string | null;

export function composerPlaceholder(kind: ComposerKind): string {
  return kind === "goal" ? "New goal" : "New task";
}

export function canAddGoal(target: ComposerTargetId): boolean {
  return target !== null;
}

export function normalizeComposerTarget(target: ComposerTargetId | undefined): ComposerTargetId {
  if (!target || target === INBOX_KEY) return null;
  return target;
}

/** Last list used, kept for the lifetime of the session (not persisted). */
let sessionTarget: ComposerTargetId = null;
export function rememberComposerTarget(target: ComposerTargetId): void {
  sessionTarget = normalizeComposerTarget(target);
}
export function lastComposerTarget(): ComposerTargetId {
  return sessionTarget;
}

/**
 * The single add surface: a text field pinned above the keyboard, with a list
 * chooser and a task/goal switch underneath it. Enter saves and stays open;
 * Done (blur) or the backdrop saves once and closes; Escape discards.
 * DayView unmounts us on `onClose`, so the closing motion is played here first.
 */
export function Composer({
  date,
  initialTarget,
  onClose,
}: {
  date: ISODate;
  /** Category id, `null` for Inbox, or `undefined` to reuse the last list. */
  initialTarget?: ComposerTargetId;
  onClose: () => void;
}) {
  const { data, actions } = useStore();
  const keyboard = useKeyboardInset();
  const cats = activeCategories(data.categories);
  const chosen =
    initialTarget === undefined ? sessionTarget : normalizeComposerTarget(initialTarget);

  const [target, setTarget] = useState<ComposerTargetId>(() =>
    chosen && cats.some((c) => c.id === chosen) ? chosen : null,
  );
  const [kind, setKind] = useState<ComposerKind>("task");
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const [listOpen, setListOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const [savedTick, setSavedTick] = useState(0);
  const closed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The exit is owned here: DayView only unmounts us once the panel is down.
  const presence = usePresence(open, MOTION_MS.base);
  const list = usePresence(listOpen, MOTION_MS.fast);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!presence.mounted) onCloseRef.current();
  }, [presence.mounted]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    rememberComposerTarget(target);
  }, [target]);

  // Inbox cannot hold a goal; switching there falls back to a task.
  useEffect(() => {
    if (!canAddGoal(target)) setKind("task");
  }, [target]);

  const activeTarget = cats.find((c) => c.id === target);
  const targetName = activeTarget?.name ?? "Inbox";
  const targetColor = activeTarget ? catColor(activeTarget.color) : "var(--accent)";
  const placeholder = composerPlaceholder(kind);

  /** Keep focus in the text field so a chooser tap can't look like Done. */
  function keepFocus(e: SyntheticEvent<HTMLElement>) {
    e.preventDefault();
  }

  function save(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (kind === "goal" && canAddGoal(target)) actions.addGoal(target as string, clean);
    else actions.addTask(date, clean, target);
  }

  /** Enter: save the current draft, clear the field and stay open. */
  function addNext() {
    if (closed.current) return;
    const clean = valueRef.current.trim();
    if (clean) {
      save(clean);
      // A fresh key replays the cue even when Enter is held down.
      setSavedTick((n) => n + 1);
    }
    valueRef.current = "";
    setValue("");
    inputRef.current?.focus();
  }

  /** Done / backdrop: save one last time, then close. The guard makes this idempotent. */
  function finish() {
    if (closed.current) return;
    closed.current = true;
    save(valueRef.current);
    setListOpen(false);
    setOpen(false);
  }

  function cancel() {
    if (closed.current) return;
    closed.current = true;
    setListOpen(false);
    setOpen(false);
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  return (
    <div className={`composer-root ${presence.closing ? "is-closing" : ""}`}>
      <button
        type="button"
        aria-label="Close composer"
        className="composer-backdrop fixed inset-0 z-40 cursor-default"
        onPointerDown={keepFocus}
        // iOS moves focus on the mouse event, so cancel that one too.
        onMouseDown={keepFocus}
        onClick={finish}
      />
      <div
        className="composer-anchor fixed inset-x-0 z-50"
        style={{ transform: keyboard ? `translateY(${-keyboard}px)` : undefined }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Add an item"
          className="composer-panel"
        >
          <div className="composer-inner">
            {savedTick > 0 && <span key={savedTick} aria-hidden className="composer-saved">Saved</span>}
            <input
              ref={inputRef}
              value={value}
              aria-label={placeholder}
              placeholder={placeholder}
              enterKeyHint="done"
              onChange={(e) => {
                valueRef.current = e.target.value;
                setValue(e.target.value);
              }}
              onKeyDown={onInputKeyDown}
              onBlur={(e) => {
                // Tabbing inside the panel is not "Done": keep the draft and the panel.
                if (panelRef.current?.contains(e.relatedTarget as Node | null)) return;
                finish();
              }}
              className="composer-input"
            />
            <div className="composer-controls">
              <div className="relative min-w-0 flex-1">
                <button
                  type="button"
                  aria-label="Choose list"
                  aria-expanded={listOpen}
                  onPointerDown={keepFocus} onMouseDown={keepFocus}
                  onClick={() => setListOpen((v) => !v)}
                  className="composer-target"
                >
                  <span aria-hidden className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: targetColor }} />
                  <span className="min-w-0 truncate">{targetName}</span>
                </button>
                {list.mounted && (
                  <div
                    role="listbox"
                    aria-label="Choose list"
                    className={`composer-list ${list.closing ? "is-closing" : ""}`}
                    onPointerDown={keepFocus} onMouseDown={keepFocus}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={target === null}
                      onClick={() => {
                        setTarget(null);
                        setListOpen(false);
                      }}
                      className="composer-list-item"
                    >
                      <span aria-hidden className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                      Inbox
                    </button>
                    {cats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={target === c.id}
                        onClick={() => {
                          setTarget(c.id);
                          setListOpen(false);
                        }}
                        className="composer-list-item"
                      >
                        <span aria-hidden className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: catColor(c.color) }} />
                        <span className="min-w-0 truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="composer-kind"
                data-kind={kind}
                role="group"
                aria-label="Item type"
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
              >
                <span aria-hidden className="composer-kind-thumb" />
                {(["task", "goal"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={kind === option}
                    disabled={option === "goal" && !canAddGoal(target)}
                    onClick={() => setKind(option)}
                    className="composer-kind-option"
                  >
                    {option === "task" ? "Task" : "Goal"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
