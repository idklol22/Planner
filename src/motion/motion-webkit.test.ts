import { describe, expect, it } from "vitest";

async function css(file: string): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL(file, import.meta.url), "utf8").split("\r\n").join("\n");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rule = (styles: string, selector: string) =>
  new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
const keyframeBodies = (styles: string) =>
  [...styles.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);

describe("WebKit-safe collapses", () => {
  it("never interpolates grid fr rows (WebKit leaves them visible or stuck)", async () => {
    for (const file of ["pages.css", "day.css", "calendar.css"]) {
      const styles = await css(`./${file}`);
      expect(styles, file).not.toMatch(/transition:[^;]*grid-template-rows/);
      for (const body of keyframeBodies(styles)) {
        expect(body, file).not.toContain("grid-template-rows");
      }
    }
  });

  it("snaps a closed collapse-grid and keeps it untappable", async () => {
    const styles = await css("./pages.css");
    expect(rule(styles, ".collapse-grid")).toContain("pointer-events: none");
    expect(rule(styles, ".collapse-grid.is-open")).toContain("pointer-events: auto");
    expect(rule(styles, ".row-shell.is-exiting")).toContain("pointer-events: none");
    expect(rule(styles, ".toast-slot.is-closing")).toContain("pointer-events: none");
  });

  it("snaps the calendar form collapse and releases a closed panel", async () => {
    const styles = await css("./calendar.css");
    expect(rule(styles, ".cal-collapse")).toContain("pointer-events: none");
    expect(rule(styles, '.cal-collapse[data-open="true"]')).toContain("pointer-events: auto");
  });

  it("closing layers take no taps and hold no space", async () => {
    const pages = await css("./pages.css");
    expect(rule(pages, ".task-panel.is-closing")).toContain("pointer-events: none");
    const calendar = await css("./calendar.css");
    const block = rule(calendar, ".cal-block.is-closing");
    expect(block).toContain("pointer-events: none");
    expect(block).toContain("height: 0");
  });
});
