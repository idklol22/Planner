import { describe, expect, it } from "vitest";

/** The suite runs in Node, so the component's wiring is checked against its
 *  source (the same convention as sheet-ui.test.ts). The gesture rule itself is
 *  tested as a pure function in calorieOutsideTap.test.ts. */
async function source(path: string): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL(path, import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("the calorie form dismisses like the inline task field", () => {
  it("routes every outside pointerdown through the pure decision", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain('import { calorieOutsideTapDecision } from "./calorieOutsideTap"');
    expect(bar).toContain("calorieOutsideTapDecision(");
    expect(bar).toContain("suppressClick.current = decision.suppress;");
    expect(bar).toContain("commitFor(dateRef.current, decision.close);");
    expect(bar).toContain("if (decision.blur) releaseFocus();");
  });

  it("swallows exactly the click after a dismissal, then clears the flag", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain('"pointerdown", onDown, true');
    expect(bar).toContain('"click", onClickCapture, true');
    expect(bar).toContain("if (!suppressClick.current) return;");
    expect(bar).toContain("suppressClick.current = false;");
    expect(bar).toContain("e.preventDefault();");
    expect(bar).toContain("e.stopPropagation();");
  });

  it("clears a stranded suppression on every fresh pointerdown, including fields", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain('[data-calorie-field]');
    expect(bar).toMatch(/\[data-calorie-field\][\s\S]{0,140}suppressClick\.current = false;/);
    expect(bar).toContain("const keepTap = !!el?.closest?.(");
    expect(bar).toContain('"[data-calorie-keep-tap], [data-inline-add-keep-tap]"');
  });

  it("keeps form controls and other plus buttons clickable in one tap", async () => {
    const bar = await source("./CalorieBar.tsx");
    // Two meters, Cancel and each Remove carry both markers: the first keeps
    // the calorie guard from swallowing them, the second does the same for the
    // page-level inline-add guard.
    expect(bar.match(/data-inline-add-keep-tap/g)?.length).toBeGreaterThanOrEqual(4);
    expect(bar.match(/data-calorie-keep-tap/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("closes the form after an external keep-tap's click has landed", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain("closeAfterClick.current = keepTap");
    expect(bar).toContain('el?.closest?.("[data-calorie-keep-tap]")');
    expect(bar).toMatch(/queueMicrotask\(\(\) => \{[\s\S]{0,80}setMode\("idle"\)/);
    expect(bar).toContain("closeAfterClick.current = false;");
  });

  it("never commits a draft from the Cancel control", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain("data-calorie-discard");
    expect(bar).toContain('el?.closest?.("[data-calorie-discard]")');
    expect(bar).toMatch(/discard,\n      \);/);
  });

  it("detects the keyboard from viewport height, not a scrolled offset", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain('import { keyboardOpenFromHeight } from "../lib/keyboard"');
    expect(bar).toContain("keyboardOpenFromHeight(window.innerHeight, viewport.height)");
    expect(bar).toContain("viewport.addEventListener(\"resize\", measure)");
    expect(bar).toContain("viewport.addEventListener(\"scroll\", measure)");
  });

  it("keeps the other save routes and their correct day", async () => {
    const bar = await source("./CalorieBar.tsx");
    expect(bar).toContain("commitFor(prevDate.current, false)");
    expect(bar).toContain("commitFor(dateRef.current, true)");
    // Enter settles without closing; Escape still discards.
    expect(bar).toMatch(/e\.key === "Enter"[\s\S]{0,80}commit\(false\)/);
    expect(bar).toMatch(/e\.key === "Escape"[\s\S]{0,120}discard\(\)/);
    expect(bar).toContain("document.addEventListener(\"visibilitychange\", onVisibility)");
    expect(bar).toContain("window.addEventListener(\"pagehide\", onExit)");
    expect(bar).toContain("if (nav.openCalories) {");
  });
});
