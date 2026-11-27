import { describe, expect, it } from "vitest";
import { resolveInlineSave } from "./inlineSave";

describe("resolveInlineSave", () => {
  it("ignores empty and whitespace-only text", () => {
    expect(resolveInlineSave("", false)).toEqual({ value: null, blocked: false });
    expect(resolveInlineSave("   ", false)).toEqual({ value: null, blocked: false });
  });

  it("saves trimmed text once and blocks the blur that follows Enter", () => {
    expect(resolveInlineSave("  Walk  ", false)).toEqual({ value: "Walk", blocked: true });
    expect(resolveInlineSave("Walk", true)).toEqual({ value: null, blocked: true });
  });

  it("lets a new value be saved after the text changes", () => {
    expect(resolveInlineSave("Run", false)).toEqual({ value: "Run", blocked: true });
  });

  it("keeps a cancelled field blocked until it changes", () => {
    expect(resolveInlineSave("Draft", true)).toEqual({ value: null, blocked: true });
  });
});
