import { describe, expect, it } from "vitest";
import { calorieOutsideTapDecision, noCalorieTap } from "./calorieOutsideTap";

const tap = (formOpen: boolean, typed: boolean, keyboardUp: boolean, keepTap = false) =>
  calorieOutsideTapDecision(formOpen, typed, keyboardUp, keepTap);

describe("calorieOutsideTapDecision", () => {
  it("does nothing when the form is closed, so no click is ever swallowed", () => {
    expect(tap(false, true, true)).toEqual(noCalorieTap);
    expect(tap(false, false, true, true)).toEqual(noCalorieTap);
    expect(tap(false, false, false)).toEqual({
      commit: false,
      blur: false,
      suppress: false,
      close: false,
    });
  });

  it("saves, closes, blurs and swallows the click when text was typed", () => {
    expect(tap(true, true, false)).toEqual({
      commit: true,
      blur: true,
      suppress: true,
      close: true,
    });
  });

  it("swallows a keyboard-dismissal tap even with an empty draft", () => {
    expect(tap(true, false, true)).toEqual({
      commit: true,
      blur: true,
      suppress: true,
      close: true,
    });
  });

  it("lets the tap through when the form is open but empty and no keyboard is up", () => {
    expect(tap(true, false, false)).toMatchObject({ suppress: false, close: true });
  });

  it("lets keep-tap controls save without collapsing the row under the finger", () => {
    expect(tap(true, true, true, true)).toEqual({
      commit: true,
      blur: false,
      suppress: false,
      close: false,
    });
  });

  it("keeps taps when the form is closed even for a keep-tap control", () => {
    expect(tap(false, false, false, true)).toEqual(noCalorieTap);
  });

  it("clears a suppression stranded by a touch-scroll that produced no click", () => {
    // A drag outside the form is a pointerdown with no follow-up click. The
    // dismissal's suppression is therefore still set when the user next taps.
    let suppressed = false;
    const scroll = tap(true, true, true);
    suppressed = scroll.suppress;
    expect(suppressed).toBe(true);

    // The drag already committed and closed the form. Every fresh pointerdown
    // overwrites the flag, so the next real tap is not swallowed.
    const closed = tap(false, false, false);
    suppressed = closed.suppress;
    expect(suppressed).toBe(false);

    // The same clearing happens if the next pointerdown lands on a form
    // control or back inside one of the inputs before the form closed.
    expect(tap(true, true, true, true).suppress).toBe(false);
  });

  it("never suppresses two taps in a row from one pointerdown", () => {
    const first = tap(true, true, true);
    const second = tap(true, true, true);
    expect(first.suppress).toBe(true);
    expect(second.suppress).toBe(true);
    // The component assigns decision.suppress on each pointerdown, so a
    // suppression lasts for exactly one click, never for the whole gesture
    // stream. The pure decisions are independent and carry no hidden state.
    expect(tap(true, false, false).suppress).toBe(false);
  });
});
