import { describe, expect, it } from "vitest";
import { nextHeading, toggledBlockType } from "./formatting";

describe("nextHeading", () => {
  it("cycles paragraph -> heading 2 -> heading 3 -> paragraph", () => {
    expect(nextHeading("paragraph", undefined)).toEqual({ type: "heading", level: 2 });
    expect(nextHeading("heading", 2)).toEqual({ type: "heading", level: 3 });
    expect(nextHeading("heading", 3)).toEqual({ type: "paragraph" });
  });

  it("starts at heading 2 from any other block", () => {
    for (const type of ["bulletListItem", "numberedListItem", "checkListItem", "heading", "quote"]) {
      expect(nextHeading(type, type === "heading" ? 1 : undefined), type).toEqual({ type: "heading", level: 2 });
    }
  });
});

describe("toggledBlockType", () => {
  it("returns to a paragraph when the active list button is pressed again", () => {
    for (const type of ["bulletListItem", "numberedListItem", "checkListItem"] as const) {
      expect(toggledBlockType("paragraph", type)).toBe(type);
      expect(toggledBlockType(type, type)).toBe("paragraph");
      expect(toggledBlockType("heading", type)).toBe(type);
    }
  });
});
