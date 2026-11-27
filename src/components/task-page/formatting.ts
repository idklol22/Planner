/** Pure decisions behind the keyboard bar's block buttons. */

export type ListType = "bulletListItem" | "numberedListItem" | "checkListItem";

/** "H" walks paragraph -> heading 2 -> heading 3 -> paragraph. */
export function nextHeading(
  type: string,
  level: number | undefined,
): { type: "heading"; level: 2 | 3 } | { type: "paragraph" } {
  if (type === "heading" && level === 2) return { type: "heading", level: 3 };
  if (type === "heading" && level === 3) return { type: "paragraph" };
  return { type: "heading", level: 2 };
}

/** List buttons toggle: pressing the active one twice returns to a paragraph. */
export function toggledBlockType<T extends string>(type: string, target: T): "paragraph" | T {
  return type === target ? "paragraph" : target;
}
