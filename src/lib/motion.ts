/** Shared motion helpers. Timings match the CSS tokens in src/motion/index.css. */
import { useEffect, useState } from "react";

export const MOTION_MS = { fast: 140, base: 240, slow: 340 } as const;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keeps something mounted while it animates out.
 * Render it while `mounted`; style the exit when `closing`. Re-opening during an exit cancels the exit.
 */
export function usePresence(open: boolean, exitMs: number = MOTION_MS.base): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  // Adjusting state during render keeps the first open frame free of a one-render delay.
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, exitMs]);
  return { mounted: open || mounted, closing: !open && mounted };
}
