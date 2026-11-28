import { describe, expect, it } from "vitest";
import { mergeExiting } from "./listExit";

type Row = { id: string };

describe("mergeExiting", () => {
  const live: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("renders live rows in place when nothing is exiting", () => {
    expect(mergeExiting(live, [])).toEqual([
      { item: { id: "a" }, exiting: false },
      { item: { id: "b" }, exiting: false },
      { item: { id: "c" }, exiting: false },
    ]);
  });

  it("keeps a removed row before its old neighbour while it collapses", () => {
    const rows = mergeExiting([{ id: "a" }, { id: "c" }], [{ item: { id: "b" }, afterId: "c" }]);
    expect(rows.map((row) => row.item.id)).toEqual(["a", "b", "c"]);
    expect(rows.find((row) => row.item.id === "b")?.exiting).toBe(true);
  });

  it("puts a removed last row at the end", () => {
    const rows = mergeExiting([{ id: "a" }, { id: "b" }], [{ item: { id: "c" }, afterId: null }]);
    expect(rows.map((row) => row.item.id)).toEqual(["a", "b", "c"]);
  });

  it("does not resurrect a row that is back in the live list", () => {
    const rows = mergeExiting(live, [{ item: { id: "b" }, afterId: "c" }]);
    expect(rows.filter((row) => row.item.id === "b")).toHaveLength(1);
    expect(rows.find((row) => row.item.id === "b")?.exiting).toBe(false);
  });
});
