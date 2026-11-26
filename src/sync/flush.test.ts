import { describe, expect, it } from "vitest";
import type { HubOp } from "../storage/hub";
import { keepaliveBatch } from "./flush";

function op(id: string, title = "Task"): HubOp {
  return {
    table: "task",
    row: {
      id,
      title,
      date: "2026-11-21",
      categoryId: null,
      parentId: null,
      seriesId: null,
      order: 0,
      done: false,
      completedAt: null,
      time: null,
      durationMin: null,
      rrule: null,
      deadline: false,
      kind: "general",
      note: null,
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
      deletedAt: null,
      archivedAt: null,
    },
  };
}

const ops = [op("a"), op("b"), op("c"), op("d"), op("e")];

describe("keepaliveBatch", () => {
  it("respects maxOps", () => {
    expect(keepaliveBatch(ops, 2, 60_000)).toEqual(ops.slice(0, 2));
    expect(keepaliveBatch(ops, 0, 60_000)).toEqual([]);
    expect(keepaliveBatch(ops, 40, 60_000)).toEqual(ops);
  });

  it("respects maxBytes against the exact { ops } body", () => {
    const throughTwo = JSON.stringify({ ops: ops.slice(0, 2) }).length;
    const throughThree = JSON.stringify({ ops: ops.slice(0, 3) }).length;
    const bareTwo = JSON.stringify(ops.slice(0, 2)).length;

    expect(keepaliveBatch(ops, 40, throughThree)).toEqual(ops.slice(0, 3));
    expect(keepaliveBatch(ops, 40, throughTwo)).toEqual(ops.slice(0, 2));
    // One byte less than a whole op's body must drop that op, not clip it.
    expect(keepaliveBatch(ops, 40, throughTwo - 1)).toEqual([ops[0]]);
    // The { ops } wrapper counts toward the limit too.
    expect(bareTwo).toBeLessThan(throughTwo);
    expect(keepaliveBatch(ops, 40, bareTwo)).toEqual([ops[0]]);
  });

  it("returns [] for empty input", () => {
    expect(keepaliveBatch([], 40, 60_000)).toEqual([]);
  });

  it("never splits an op", () => {
    const big = op("big", "x".repeat(200));
    // A single op larger than the limit yields no partial op.
    expect(keepaliveBatch([big, ...ops], 40, JSON.stringify({ ops: [big] }).length - 1)).toEqual([]);

    const batch = keepaliveBatch([big, ...ops], 40, JSON.stringify({ ops: [big, ops[0]] }).length);
    expect(batch).toEqual([big, ops[0]]);
    for (const item of batch) expect(ops.includes(item) || item === big).toBe(true);
  });
});
