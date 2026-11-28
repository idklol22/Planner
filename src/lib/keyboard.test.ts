import { describe, expect, it } from "vitest";
import {
  KEYBOARD_THRESHOLD,
  keyboardDismissed,
  keyboardInset,
  keyboardInsetFromViewport,
  keyboardOpenFromHeight,
  measureKeyboardInset,
} from "./keyboard";

describe("keyboardInset", () => {
  it("is zero when the visual viewport has not shrunk", () => {
    expect(keyboardInset(800, 800, 0)).toBe(0);
  });

  it("ignores small chrome changes below the threshold", () => {
    expect(keyboardInset(800, 800 - KEYBOARD_THRESHOLD, 0)).toBe(0);
    expect(keyboardInset(800, 760, 0)).toBe(0);
  });

  it("reports the hidden height once the keyboard is up", () => {
    expect(keyboardInset(800, 700, 0)).toBe(100);
    expect(keyboardInset(812, 375, 0)).toBe(437);
  });

  it("accounts for the visual viewport being scrolled", () => {
    expect(keyboardInset(800, 700, 20)).toBe(0); // exactly at the threshold
    expect(keyboardInset(800, 700, 10)).toBe(90);
  });

  it("rounds fractional viewport measurements", () => {
    expect(keyboardInset(800, 712.4, 0)).toBe(88);
  });

  it("exposes the aliases used by call sites", () => {
    expect(keyboardInsetFromViewport).toBe(keyboardInset);
    expect(measureKeyboardInset).toBe(keyboardInset);
  });
});

describe("keyboardOpenFromHeight", () => {
  it("ignores offsetTop entirely — scrolling with the keyboard up cannot close it", () => {
    // WKWebView can raise offsetTop while the keyboard is up; that used to
    // zero the derived inset and look like a dismissal mid-typing.
    for (const offsetTop of [0, 20, 100, 300, 600]) {
      // The old, broken signal reads 0 for a large offset while typing...
      expect(keyboardInset(812, 375, offsetTop)).toBe(437 - offsetTop > 80 ? 437 - offsetTop : 0);
      // ...but the height-only signal still says the keyboard is open.
      expect(keyboardOpenFromHeight(812, 375)).toBe(true);
    }
  });

  it("reports open only while the visual viewport is meaningfully shorter", () => {
    expect(keyboardOpenFromHeight(812, 812)).toBe(false);
    expect(keyboardOpenFromHeight(812, 375)).toBe(true);
    expect(keyboardOpenFromHeight(812, 812 - KEYBOARD_THRESHOLD)).toBe(false);
  });
});

describe("keyboardDismissed", () => {
  const full = 812;
  const withKeyboard = 375;

  it("is true only when a previously open keyboard's height returns to full", () => {
    expect(keyboardDismissed(full, full, 0, true, true)).toBe(true);
    expect(keyboardDismissed(full, withKeyboard, 0, true, true)).toBe(false);
  });

  it("never fires from an offsetTop change while the keyboard is still up", () => {
    // The exact iOS bug: inset collapses to 0 because offsetTop grew, but the
    // height is unchanged, so this must NOT be treated as a dismissal.
    for (const offsetTop of [0, 50, 200, 400]) {
      expect(keyboardDismissed(full, withKeyboard, offsetTop, true, true)).toBe(false);
    }
    // And the real dismissal is detected regardless of the offset it had.
    expect(keyboardDismissed(full, full, 400, true, true)).toBe(true);
  });

  it("requires the keyboard to have been open", () => {
    expect(keyboardDismissed(full, full, 0, false, true)).toBe(false);
  });

  it("requires the field to still be focused", () => {
    // If it already blurred, blur committed the draft; a second save is wrong.
    expect(keyboardDismissed(full, full, 0, true, false)).toBe(false);
  });
});
