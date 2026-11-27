import { describe, expect, it } from "vitest";
import { INBOX_KEY, partitionDaySections, sectionKey, visibleDaySections } from "./daySections";
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
  it("keeps sections with tasks or ghosts as full blocks, in order", () => {
    const visible = partitionDaySections([row(home, 1), row(health, 0, 1), row(work)], []);
    expect(visible.map((r) => r.section.category?.name)).toEqual(["Home", "Health"]);
    expect(visible.empty).toEqual([]);
  });

  it("counts open and achieved goals as content, but not deleted goals", () => {
    const open = { ...makeGoal(health.id, "Read", 0) };
    const achieved = { ...makeGoal(work.id, "Run", 0), achievedAt: "2026-01-14T10:00:00Z" };
    const deleted = { ...makeGoal(home.id, "Gone", 0), deletedAt: "2026-01-14T10:00:00Z" };
    const visible = partitionDaySections([row(home), row(health), row(work)], [deleted, open, achieved]);
    expect(visible.map((r) => r.section.category?.name)).toEqual(["Health", "Work"]);
  });

  it("no longer promotes a section just because an old inline input id is passed", () => {
    const visible = partitionDaySections([row(home), row(health)], [], health.id);
    expect(visible).toEqual([]);
  });

  it("never lists Inbox as an empty category, but keeps an occupied Inbox", () => {
    expect(partitionDaySections([row(null), row(home)], [])).toEqual([]);

    const inboxFull = partitionDaySections([row(null, 1, 1)], []);
    expect(inboxFull.map((r) => sectionKey(r.section))).toEqual([INBOX_KEY]);
  });

  it("keeps the old filled alias and an always-empty empty alias", () => {
    const withTask = row(home, 1);
    const visible = visibleDaySections([withTask, row(health)], []);
    expect(visible.filled).toBe(visible);
    expect(visible.empty).toEqual([]);
    // The aliases are metadata, not extra rows: array equality still works.
    expect(visible).toEqual([withTask]);
  });
});
