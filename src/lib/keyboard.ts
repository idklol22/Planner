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
