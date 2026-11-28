import { describe, expect, it } from "vitest";
import {
  commitDraft,
  emptyDraft,
  outsideTapDecision,
  reduceDraft,
  resolveInlineSave,
  type DraftEvent,
  type DraftState,
} from "./inlineSave";

const typed = (value: string): DraftState => ({ value, settled: false });
const run = (state: DraftState, ...events: DraftEvent[]) => {
  let current = state;
  let save: string | null = null;
  let close = false;
  for (const event of events) {
    const result = reduceDraft(current, event);
    current = result.state;
    save = result.save ?? save;
    close = close || result.close;
  }
  return { state: current, save, close };
};

describe("reduceDraft: every way a draft is saved", () => {
  it("saves trimmed text exactly once on the keyboard's Done / blur", () => {
    expect(commitDraft(typed("  Walk the dog  "), "done")).toEqual({
      state: { value: "  Walk the dog  ", settled: true },
      save: "Walk the dog",
      close: true,
    });
    expect(commitDraft(typed("Walk"), "blur").save).toBe("Walk");
    // iOS often fires a blur after the outside-tap commit: no second save.
    expect(run(typed("Walk"), { type: "commit", reason: "done" }, { type: "commit", reason: "blur" })).toEqual({
      state: { value: "Walk", settled: true },
      save: "Walk",
      close: true,
    });
  });

  it("saves on a pointerdown outside the field even when iOS would not blur", () => {
    expect(commitDraft(typed("Draft"), "outside").save).toBe("Draft");
    expect(
      run(
        typed("Draft"),
        { type: "commit", reason: "outside" },
        { type: "commit", reason: "blur" },
      ).save,
    ).toBe("Draft");
  });

  it("saves when the keyboard is dismissed without any blur", () => {
    expect(commitDraft(typed("Draft"), "keyboard-hide")).toMatchObject({
      save: "Draft",
      close: true,
    });
  });

  it("saves before switching to another category's field", () => {
    const first = commitDraft(typed("First"), "switch");
    expect(first.save).toBe("First");
    expect(first.close).toBe(true);
    // The new field has its own, fresh draft.
    expect(reduceDraft(emptyDraft, { type: "change", value: "Second" }).save).toBeNull();
    expect(commitDraft(typed("Second"), "blur").save).toBe("Second");
  });

  it("saves when the selected day changes", () => {
    expect(commitDraft(typed("For Monday"), "day-change").save).toBe("For Monday");
  });

  it("saves when a task document or a menu page opens", () => {
    expect(commitDraft(typed("Draft"), "navigation").save).toBe("Draft");
  });

  it("saves on unmount", () => {
    expect(commitDraft(typed("Draft"), "unmount").save).toBe("Draft");
  });

  it("saves when the app goes to the background", () => {
    expect(commitDraft(typed("Draft"), "background").save).toBe("Draft");
  });

  it("Enter saves and leaves an empty field open for the next one", () => {
    const enter = reduceDraft(typed("One"), { type: "enter" });
    expect(enter).toEqual({ state: emptyDraft, save: "One", close: false });
    // The blur that may follow Enter (or a later outside tap) saves nothing.
    expect(commitDraft(enter.state, "blur")).toMatchObject({ save: null, close: true });
    expect(commitDraft(enter.state, "outside").save).toBeNull();
    // A newly typed second task is a fresh draft and is saved.
    const second = reduceDraft(enter.state, { type: "change", value: "Two" });
    expect(commitDraft(second.state, "blur").save).toBe("Two");
  });

  it("Enter with an empty or already-settled field neither saves nor closes", () => {
    expect(reduceDraft(emptyDraft, { type: "enter" })).toEqual({
      state: emptyDraft,
      save: null,
      close: false,
    });
    const settled: DraftState = { value: "Old", settled: true };
    expect(reduceDraft(settled, { type: "enter" })).toEqual({
      state: emptyDraft,
      save: null,
      close: false,
    });
  });

  it("Escape discards the draft and blocks the blur that follows", () => {
    const cancelled = reduceDraft(typed("Throw away"), { type: "cancel" });
    expect(cancelled).toEqual({ state: { value: "Throw away", settled: true }, save: null, close: true });
    expect(commitDraft(cancelled.state, "blur").save).toBeNull();
  });

  it("empty and whitespace-only drafts just close", () => {
    expect(commitDraft(emptyDraft, "blur")).toEqual({
      state: { value: "", settled: true },
      save: null,
      close: true,
    });
    expect(commitDraft(typed("   \n "), "outside").save).toBeNull();
  });

  it("new text unsettles a settled draft, identical text does not", () => {
    const saved = commitDraft(typed("Saved"), "blur").state;
    expect(reduceDraft(saved, { type: "change", value: "Saved" }).state.settled).toBe(true);
    const edited = reduceDraft(saved, { type: "change", value: "Saved again" });
    expect(edited.state.settled).toBe(false);
    expect(commitDraft(edited.state, "blur").save).toBe("Saved again");
  });

  it("never saves the same draft twice across repeated events", () => {
    const result = run(
      typed("Only once"),
      { type: "commit", reason: "outside" },
      { type: "commit", reason: "keyboard-hide" },
      { type: "commit", reason: "unmount" },
      { type: "commit", reason: "background" },
    );
    expect(result.save).toBe("Only once");
    expect(result.state.settled).toBe(true);
  });
});

describe("outsideTapDecision", () => {
  it("clears the click suppression when a touch-scroll already dismissed the field", () => {
    // A drag outside the field produces no click. The next pointerdown must
    // start clean or it would swallow the next real tap's click.
    expect(outsideTapDecision(false, false)).toEqual({ commit: false, blur: false, suppress: false });
  });

  it("saves and swallows the click of a keyboard-dismissal tap", () => {
    expect(outsideTapDecision(true, false)).toEqual({ commit: true, blur: true, suppress: true });
  });

  it("leaves the field in place for another '+' or 'Add goal' so the tap does not move", () => {
    expect(outsideTapDecision(true, true)).toEqual({ commit: false, blur: false, suppress: false });
  });
});

describe("resolveInlineSave", () => {
  it("ignores empty and whitespace-only text", () => {
    expect(resolveInlineSave("", false)).toEqual({ value: null, blocked: false });
    expect(resolveInlineSave("   ", false)).toEqual({ value: null, blocked: false });
  });

  it("saves trimmed text once and blocks the blur that follows Enter", () => {
    expect(resolveInlineSave("  Walk  ", false)).toEqual({ value: "Walk", blocked: true });
    expect(resolveInlineSave("Walk", true)).toEqual({ value: null, blocked: true });
  });
});
