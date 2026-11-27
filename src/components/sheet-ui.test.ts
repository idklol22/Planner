import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL(path, import.meta.url), "utf8").split("\r\n").join("\n");
}

async function css(): Promise<string> {
  return source("../index.css");
}

describe("the one content sheet", () => {
  it("defines one opaque, blurred surface with 24px top corners and a hairline", async () => {
    const styles = await css();
    const sheet = /\.sheet\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(sheet).toContain("border-top: 1px solid var(--border)");
    expect(sheet).toContain("border-radius: 24px 24px 0 0");
    expect(sheet).toContain("color-mix(in srgb, var(--surface) 96%, transparent)");
    expect(sheet).toContain("backdrop-filter: blur(");
    // Light and high-contrast themes get a fully solid surface.
    expect(styles).toContain('html[data-theme="contrast"] .sheet');
    expect(styles).toContain("background: var(--surface)");
  });

  it("has a docked 48px full-width control above the safe area", async () => {
    const styles = await css();
    expect(styles).toMatch(/\.add-dock\s*\{[^}]*position:\s*fixed/);
    expect(styles).toMatch(/\.add-task-button\s*\{[^}]*height:\s*48px/);
    expect(styles).toContain("padding-bottom: var(--safe-bottom)");
  });

  it("pins the composer above the keyboard and dims the rest", async () => {
    const styles = await css();
    expect(styles).toContain(".composer-backdrop");
    expect(styles).toMatch(/\.composer-panel\s*\{[^}]*border-top:\s*1px solid var\(--border\)/);
  });
});

describe("one place to add things", () => {
  it("removed every scattered add control from the day view", async () => {
    const view = await source("./DayView.tsx");
    expect(view).not.toContain("InlineAdd");
    expect(view).not.toContain("hideEmpty");
    expect(view).not.toContain("Add goal");
    expect(view).not.toContain("setAdding");
    expect(view).toContain("Nothing planned");
    expect(view).toContain("from \"./Composer\"");
  });

  it("uses one docked add button and a clickable list header", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain('aria-label="Add a task"');
    expect(view).toContain("aria-label={`Add task to ${name}`}");
    expect(view).toContain("className=\"sheet mt-2 flex-1\"");
  });

  it("has no inline goal input left", async () => {
    const goals = await source("./CategoryGoals.tsx");
    expect(goals).not.toContain("New goal");
    expect(goals).not.toContain("adding");
  });

  it("puts menu page content on a sheet but keeps the header on the background", async () => {
    const shell = await source("./AppShell.tsx");
    expect(shell).toContain("className=\"sheet flex-1\"");
    expect(shell).toContain("active={!page && !onTask}");
  });

  it("shares the keyboard hook with the task page", async () => {
    const page = await source("./task-page/TaskPage.tsx");
    expect(page).toContain('useKeyboardInset } from "../../lib/keyboard"');
    expect(page).not.toContain("function useKeyboardInset");
  });
});
