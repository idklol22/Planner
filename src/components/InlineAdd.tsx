import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import type { ISODate } from "../domain/dates";
import { keyboardDismissed, keyboardInset, useKeyboardInset } from "../lib/keyboard";
import { useStore } from "../state/store";
import {
  emptyDraft,
  reduceDraft,
  type DraftEvent,
  type DraftState,
  type InlineCommitReason,
} from "./inlineSave";

export type InlineAddKind = "task" | "goal";

/** One open field. `date` and `target` are frozen when it opens so a day
 *  change still saves to the day the text was typed for. */
export interface InlineState {
  id: number;
  date: ISODate;
  /** null = Inbox (tasks only). */
  target: string | null;
  kind: InlineAddKind;
}

export interface InlineController {
  commit(reason: InlineCommitReason): void;
}

interface InlineAddProps {
  date: ISODate;
  target: string | null;
  kind: InlineAddKind;
  placeholder: string;
  onClose: () => void;
  controllerRef: RefObject<InlineController | null>;
}

/**
 * The inline row at the end of a category's list.
 *
 * DayView renders this synchronously (flushSync) inside the "+" tap and we
 * focus in a layout effect — never after a timer or an animation — so the iOS
 * keyboard opens from the same gesture. Every save path goes through the pure
 * `reduceDraft` rule, so Done, blur, an outside pointerdown, the keyboard
 * going away on its own, switching lists, day changes, navigation, unmount
 * and backgrounding all save once and only once.
 */
export function InlineAdd({
  date,
  target,
  kind,
  placeholder,
  onClose,
  controllerRef,
}: InlineAddProps) {
  const { actions } = useStore();
  const keyboard = useKeyboardInset();
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const draftRef = useRef(draft);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const performSave = useCallback(
    (text: string) => {
      if (kind === "goal" && target) actions.addGoal(target, text);
      else actions.addTask(date, text, target);
    },
    [actions, date, kind, target],
  );

  const saveRef = useRef(performSave);
  saveRef.current = performSave;

  const dispatch = useCallback(
    (event: DraftEvent) => {
      const result = reduceDraft(draftRef.current, event);
      draftRef.current = result.state;
      setDraft(result.state);
      if (result.save) performSave(result.save);
      if (result.close) onCloseRef.current();
    },
    [performSave],
  );
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Focus and scroll from the very tap that opened the field. A layout effect
  // inside DayView's flushSync runs before the browser hands control back.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center", inline: "nearest" });
  }, []);

  // DayView owns the document-level outside-tap guard; it needs a way to ask
  // us to commit before that tap reaches whatever is under the finger.
  useEffect(() => {
    const controller: InlineController = {
      commit: (reason) => dispatchRef.current({ type: "commit", reason }),
    };
    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef]);

  // An unmounting field (day change, navigation, another "+", page teardown)
  // still saves its draft, with the date it was opened for.
  useEffect(
    () => () => {
      // Save only what is still unsaved, and never call onClose from here: when another field has just taken over
      // (switching lists) that would close the new one. Nothing typed, or already saved, means nothing to do, which
      // also keeps StrictMode's simulated unmount/remount harmless.
      const draft = draftRef.current;
      if (draft.settled || !draft.value.trim()) return;
      const result = reduceDraft(draft, { type: "commit", reason: "unmount" });
      draftRef.current = result.state;
      if (result.save) saveRef.current(result.save);
    },
    [],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        dispatchRef.current({ type: "commit", reason: "background" });
      }
    };
    const onPageHide = () => dispatchRef.current({ type: "commit", reason: "background" });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // iOS can dismiss the keyboard without firing a blur. Never treat
  // `keyboard === 0` as that signal: the shared inset subtracts offsetTop,
  // which WKWebView raises while the page scrolls with the keyboard up, so it
  // can read 0 mid-typing. Track the height-only inset instead and let the
  // pure `keyboardDismissed` decide, with the field's focus as a guard.
  const lastInset = useRef(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => {
      const heightInset = keyboardInset(window.innerHeight, viewport.height);
      const was = lastInset.current;
      lastInset.current = heightInset;
      if (
        keyboardDismissed(
          window.innerHeight,
          viewport.height,
          viewport.offsetTop,
          was > 0,
          document.activeElement === inputRef.current,
        )
      ) {
        dispatchRef.current({ type: "commit", reason: "keyboard-hide" });
      }
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  // The keyboard may appear after focus; keep the row in view above it.
  useEffect(() => {
    if (keyboard > 0) inputRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [keyboard]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "enter" });
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "cancel" });
    }
  }

  return (
    <div className="inline-add-row flex min-h-11 items-center" data-inline-add-field>
      <input
        ref={inputRef}
        value={draft.value}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        onChange={(e) => dispatch({ type: "change", value: e.target.value })}
        onKeyDown={onKeyDown}
        onBlur={() => dispatch({ type: "commit", reason: "blur" })}
        data-inline-add-field
        className="inline-add-input min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
