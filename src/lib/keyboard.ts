import { useEffect, useState } from "react";

/** Below this height difference we treat the change as browser chrome, not the keyboard. */
export const KEYBOARD_THRESHOLD = 80;

/**
 * Pure part of the keyboard measurement: how much of the layout viewport the
 * visual viewport has lost to the on-screen keyboard. `offsetTop` is the amount
 * the visual viewport has scrolled down, which eats into the hidden height.
 */
export function keyboardInset(innerHeight: number, height: number, offsetTop = 0): number {
  const hidden = innerHeight - height - offsetTop;
  return hidden > KEYBOARD_THRESHOLD ? Math.round(hidden) : 0;
}

/** Aliases kept short so call sites can read naturally. */
export const keyboardInsetFromViewport = keyboardInset;
export const measureKeyboardInset = keyboardInset;

/**
 * Whether the on-screen keyboard is up, judged ONLY from the visual viewport's
 * height. `offsetTop` is deliberately not part of this: WKWebView raises it
 * while the page scrolls with the keyboard open, which can drive the derived
 * inset to 0 mid-typing. Height does not change for that scroll, so it is the
 * reliable signal.
 */
export function keyboardOpenFromHeight(innerHeight: number, height: number): boolean {
  return innerHeight - height > KEYBOARD_THRESHOLD;
}

/**
 * Pure keyboard-dismissal decision.
 *
 * The keyboard is dismissed when it was observed open and the visual viewport
 * has since returned to the full layout height. `offsetTop` is accepted only
 * so tests can prove that scrolling/offset changes can never dismiss the
 * keyboard; the decision ignores it. `focused` matters because a field that
 * already blurred saved its draft on blur — only a still-focused field needs
 * the explicit keyboard-hide commit.
 */
export function keyboardDismissed(
  innerHeight: number,
  height: number,
  _offsetTop: number,
  wasOpen: boolean,
  focused: boolean,
): boolean {
  return focused && wasOpen && !keyboardOpenFromHeight(innerHeight, height);
}

/** Height of the on-screen keyboard, so a docked bar can sit just above it. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => setInset(keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}

export default useKeyboardInset;
