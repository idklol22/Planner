import { describe, expect, it } from "vitest";

async function css(): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL("../motion/pages.css", import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("pages motion", () => {
  it("uses only the shared duration tokens", async () => {
    const styles = await css();
    // Stagger delays are not durations; only the animation/transition times are tokens.
    const durations = styles.replace(/animation-delay:\s*\d+ms;/g, "");
    expect(durations).not.toMatch(/\d+(\.\d+)?m?s\b/);
    expect(styles).toContain("var(--motion-fast)");
    expect(styles).toContain("var(--motion)");
  });

  it("gives every opening thing a matching exit", async () => {
    const styles = await css();
    for (const name of ["page-push-in", "panel-rise", "toast-slide-in", "page-block-in"]) {
      expect(styles).toContain(`@keyframes ${name}`);
    }
    expect(styles).toContain(".page.is-exiting");
    expect(styles).toContain(".panel-sheet.is-closing");
    expect(styles).toContain(".toast-slot.is-closing");
    expect(styles).toContain(".row-shell.is-exiting");
  });

  it("collapses height with the 0fr/1fr grid technique and honours reduced motion", async () => {
    const styles = await css();
    expect(styles).toContain("grid-template-rows: 0fr");
    expect(styles).toContain("grid-template-rows: 1fr");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).not.toContain("will-change");
  });
});
