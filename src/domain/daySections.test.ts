import { describe, expect, it } from "vitest";
import {
  daySlideDirection,
  INBOX_KEY,
  mergeMotionRows,
  partitionDaySections,
  sectionKey,
  visibleDaySections,
} from "./daySections";
import { makeCategory, makeGoal, makeHabit, makeTask } from "./model";
import type { DaySectionRow } from "./daySections";

const DATE = "2026-01-15";
const home = makeCategory("Home", 0, "#fff");
const health = makeCategory("Health", 1, "#abc");
const work = makeCategory("Work", 2, "#123");

function row(category: typeof home | null, tasks = 0, ghosts = 0): DaySectionRow {
  return {
    section: {
      category,
      tasks: Array.from({ length: tasks }, (_, i) => makeTask(DATE, `task ${i}`, i)),
    },
    ghosts: Array.from({ length: ghosts }, () => makeHabit("Stretch", category?.id ?? null, DATE, null)),
  };
}

describe("partitionDaySections", () => {
  it("keeps every active category, including completely empty ones, in order", () => {
    const rows = [row(home, 1), row(health), row(work, 0, 1)];
    const visible = partitionDaySections(rows, []);
    expect(visible.map((r) => r.section.category?.name)).toEqual(["Home", "Health", "Work"]);
    expect(visible[1].section.tasks).toEqual([]);
    expect(visible[1].ghosts).toEqual([]);
  });

  it("no longer hides a category just because its goals are gone or an old inline id is passed", () => {
    const visible = partitionDaySections([row(home), row(health)], [], health.id);
    expect(visible.map((r) => sectionKey(r.section))).toEqual([home.id, health.id]);
  });

  it("keeps a category that has a live or achieved goal, even when empty", () => {
    const open = makeGoal(health.id, "Read", 0);
    const achieved = { ...makeGoal(work.id, "Run", 0), achievedAt: "2026-01-14T10:00:00Z" };
    const visible = partitionDaySections([row(home), row(health), row(work)], [open, achieved]);
    expect(visible).toHaveLength(3);
  });

  it("shows Inbox with tasks or ghosts, alongside categories", () => {
    const visible = partitionDaySections([row(null, 1, 1), row(home)], []);
    expect(visible.map((r) => sectionKey(r.section))).toEqual([INBOX_KEY, home.id]);
  });

  it("hides an empty Inbox when there are categories, but shows it when there are none", () => {
    expect(partitionDaySections([row(null), row(home)], [])).toEqual([row(home)]);
    const alone = partitionDaySections([row(null)], []);
    expect(alone.map((r) => sectionKey(r.section))).toEqual([INBOX_KEY]);
  });

  it("keeps the old filled alias and an always-empty empty alias", () => {
    const withTask = row(home, 1);
    const visible = visibleDaySections([withTask, row(health)], []);
    expect(visible.filled).toBe(visible);
    expect(visible.empty).toEqual([]);
    // The aliases are metadata, not extra rows: array equality still works.
    expect(visible).toEqual([withTask, row(health)]);
  });
});

describe("daySlideDirection", () => {
  it("is null for the first render and for the same day", () => {
    expect(daySlideDirection(null, DATE)).toBeNull();
    expect(daySlideDirection(DATE, DATE)).toBeNull();
  });

  it("matches the direction of the date change", () => {
    expect(daySlideDirection(DATE, "2026-01-16")).toBe("next");
    expect(daySlideDirection(DATE, "2026-01-14")).toBe("prev");
  });
});

describe("mergeMotionRows", () => {
  const item = (id: string) => ({ id });

  it("marks only brand-new rows as entering", () => {
    const rows = mergeMotionRows([item("a"), item("b")], [], [], new Set(["b"]));
    expect(rows).toEqual([
      { item: item("a"), present: true, entering: false },
      { item: item("b"), present: true, entering: true },
    ]);
  });

  it("keeps a removed row in its old slot while it leaves", () => {
    const rows = mergeMotionRows(
      [item("a"), item("c")],
      [item("b")],
      ["a", "b", "c"],
      new Set(),
    );
    expect(rows.map((r) => [r.item.id, r.present])).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
  });

  it("puts a removed first row before the survivors", () => {
    const rows = mergeMotionRows([item("b")], [item("a")], ["a", "b"], new Set());
    expect(rows.map((r) => r.item.id)).toEqual(["a", "b"]);
    expect(rows[0].present).toBe(false);
  });

  it("drops the stale copy once the live row is back", () => {
    const rows = mergeMotionRows([item("b"), item("a")], [item("a")], ["a", "b"], new Set(["a"]));
    expect(rows.map((r) => [r.item.id, r.present, r.entering])).toEqual([
      ["b", true, false],
      ["a", true, true],
    ]);
  });
});
