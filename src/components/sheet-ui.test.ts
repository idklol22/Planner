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
    expect(sheet).toContain("border-top: 1px solid var(--border-strong)");
    expect(sheet).toContain("border-radius: 24px 24px 0 0");
    expect(sheet).toContain("color-mix(in srgb, var(--surface-2) 94%, transparent)");
    expect(sheet).toContain("backdrop-filter: blur(");
    // Light and high-contrast themes get a fully solid surface.
    expect(styles).toContain('html[data-theme="contrast"] .sheet');
    expect(styles).toContain("background: var(--surface-2)");
  });

  it("keeps menu page content on a sheet but the header on the background", async () => {
    const shell = await source("./AppShell.tsx");
    expect(shell).toContain("className=\"sheet flex-1\"");
    expect(shell).toContain("active={!page && !onTask}");
  });
});

describe("a plus on every category, no docked bar or composer", () => {
  it("removed the docked add bar and add panel from code and styles", async () => {
    const styles = await css();
    expect(styles).not.toContain(".add-dock");
    expect(styles).not.toContain(".add-task-button");
    expect(styles).not.toContain(".composer-panel");
    const dayMotion = await source("../motion/composer.css");
    expect(dayMotion).not.toContain(".composer-anchor");
    expect(dayMotion).not.toContain("composer-panel-in");
    // The task screen and keyboard bar animations still live in that file.
    expect(dayMotion).toContain(".task-page");
    expect(dayMotion).toContain(".keybar-anchor");
  });

  it("gives every header a 44px + aimed at its own category", async () => {
    const view = await source("./DayView.tsx");
    expect(view).not.toContain("Composer");
    expect(view).not.toContain("Add a task");
    expect(view).toContain('aria-label={`Add task to ${name}`}');
    expect(view).toContain("inline-add-trigger");
    expect(view).toContain('data-inline-add-keep-tap');
    const styles = await css();
    expect(styles).toMatch(/\.inline-add-trigger\s*\{[^}]*background:\s*none/);
    expect(styles).toContain("min-height: 44px");
  });

  it("keeps the sheet and shows empty categories through the day section rule", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain("className=\"sheet mt-2 flex-1\"");
    expect(view).toContain("Nothing planned");
    const sections = await source("../domain/daySections.ts");
    expect(sections).toContain("if (row.section.category) return true");
    expect(sections).toContain("noCategories");
  });

  it("opens a goals popover from the category name", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain('aria-label={`Add goal to ${name}`}');
    expect(view).toContain("Archive");
    expect(view).toContain("createPortal(");
    expect(view).toContain("day-pop fixed z-20");
  });
});

describe("the inline field", () => {
  it("renders at the end of a list in task or goal mode", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain("placeholder=\"New task\"");
    expect(view).toContain("<InlineAdd");
    const goals = await source("./CategoryGoals.tsx");
    expect(goals).toContain("placeholder=\"New goal\"");
    expect(goals).toContain("<InlineAdd");
  });

  it("mounts and focuses from the same tap, never after a timer", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain("flushSync(");
    expect(view).toContain("openInline(");
    const field = await source("./InlineAdd.tsx");
    expect(field).toContain("useLayoutEffect(");
    expect(field).toContain(".focus(");
    expect(field).toContain("scrollIntoView(");
    expect(field).not.toContain("setTimeout");
  });

  it("saves on every escape route and swallows the dismissing click", async () => {
    const field = await source("./InlineAdd.tsx");
    expect(field).toContain('reason: "blur"');
    expect(field).toContain('reason: "keyboard-hide"');
    expect(field).toContain('reason: "unmount"');
    expect(field).toContain('reason: "background"');
    expect(field).toContain("visibilitychange");
    expect(field).toContain("pagehide");
    expect(field).toContain("keyboard === 0");
    const view = await source("./DayView.tsx");
    expect(view).toContain('commit("outside")');
    expect(view).toContain('commit("day-change")');
    expect(view).toContain('commit("navigation")');
    expect(view).toContain('commit("switch")');
    expect(view).toContain('"pointerdown", onPointerDown, true');
    expect(view).toContain('"click", onClickCapture, true');
    expect(view).toContain("suppressClick.current");
  });

  it("gives the page room above the keyboard while the field is open", async () => {
    const view = await source("./DayView.tsx");
    expect(view).toContain("useKeyboardInset");
    expect(view).toContain("keyboard + 104");
  });

  it("keeps the save-once rule in a pure module", async () => {
    const rule = await source("./inlineSave.ts");
    expect(rule).toContain("export function reduceDraft");
    expect(rule).toContain("settled");
    expect(rule).toContain("cancel");
  });

  it("shares the keyboard hook with the task page", async () => {
    const page = await source("./task-page/TaskPage.tsx");
    expect(page).toContain('useKeyboardInset } from "../../lib/keyboard"');
    expect(page).not.toContain("function useKeyboardInset");
  });
});
