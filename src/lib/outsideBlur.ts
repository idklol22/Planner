import { useEffect } from "react";

/**
 * iOS does not always blur a text field when the user taps blank space above
 * the keyboard. Blur the focused field ourselves on an outside touch or on
 * backgrounding, so its existing onBlur handler saves the draft. Tapping the
 * field itself is left alone.
 */
export function useOutsideBlur(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const blurFocused = () => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused) return;
      if (focused.tagName !== "INPUT" && focused.tagName !== "TEXTAREA" && !focused.isContentEditable) return;
      focused.blur();
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      const focused = focusedElement();
      if (!focused || el === focused || el?.contains?.(focused)) return;
      blurFocused();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") blurFocused();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", blurFocused);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", blurFocused);
    };
  }, [active]);
}

function focusedElement(): HTMLElement | null {
  return document.activeElement as HTMLElement | null;
}
