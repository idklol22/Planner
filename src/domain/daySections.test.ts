import { describe, expect, it } from "vitest";
import { INBOX_KEY, partitionDaySections, sectionKey } from "./daySections";
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
    const { filled, empty } = partitionDaySections(
      [row(home, 1), row(health, 0, 1), row(work)],
      [],
      null,
    );
    expect(filled.map((r) => r.section.category?.name)).toEqual(["Home", "Health"]);
    expect(empty.map((c) => c.name)).toEqual(["Work"]);
  });

  it("counts open and achieved goals as content", () => {
    const open = { ...makeGoal(health.id, "Read", 0) };
    const achieved = { ...makeGoal(work.id, "Run", 0), achievedAt: "2026-01-14T10:00:00Z" };
    const deleted = { ...makeGoal(home.id, "Gone", 0), deletedAt: "2026-01-14T10:00:00Z" };
    const { filled, empty } = partitionDaySections(
      [row(home), row(health), row(work)],
      [deleted, open, achieved],
      null,
    );
    expect(filled.map((r) => r.section.category?.name)).toEqual(["Health", "Work"]);
    expect(empty.map((c) => c.name)).toEqual(["Home"]);
  });

  it("promotes a category with an open inline input to a full block", () => {
    const { filled, empty } = partitionDaySections([row(home), row(health)], [], health.id);
    expect(filled.map((r) => r.section.category?.name)).toEqual(["Health"]);
    expect(empty.map((c) => c.name)).toEqual(["Home"]);
  });

  it("never lists Inbox as an empty category, but keeps an occupied Inbox", () => {
    const inboxEmpty = partitionDaySections([row(null), row(home)], [], null);
    expect(inboxEmpty.filled).toEqual([]);
    expect(inboxEmpty.empty.map((c) => c.name)).toEqual(["Home"]);

    const inboxFull = partitionDaySections([row(null, 1, 1)], [], null);
    expect(inboxFull.filled.map((r) => sectionKey(r.section))).toEqual([INBOX_KEY]);
    expect(inboxFull.empty).toEqual([]);
  });

  it("shows an Inbox whose input is open", () => {
    const { filled } = partitionDaySections([row(null)], [], INBOX_KEY);
    expect(filled.map((r) => sectionKey(r.section))).toEqual([INBOX_KEY]);
  });
});
