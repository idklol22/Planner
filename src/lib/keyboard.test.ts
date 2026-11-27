import { describe, expect, it } from "vitest";
import {
  KEYBOARD_THRESHOLD,
  keyboardInset,
  keyboardInsetFromViewport,
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
