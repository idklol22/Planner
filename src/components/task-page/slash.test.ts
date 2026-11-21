import { describe, expect, it } from "vitest";
import { taskBlockProps, taskSlashItemMatches } from "./slash";

describe("taskSlashItemMatches", () => {
  it("matches the title in any case, with or without a leading slash", () => {
    for (const query of ["task", "Task", "TASK", "/task", "/Task"]) {
      expect(taskSlashItemMatches(query), query).toBe(true);
    }
  });

  it("matches prefixes and aliases", () => {
    for (const query of ["ta", "todo", "subtask", "check"]) {
      expect(taskSlashItemMatches(query), query).toBe(true);
    }
  });

  it("does not match other items or an empty query", () => {
    for (const query of ["heading", "code", "table", ""]) {
      expect(taskSlashItemMatches(query), query).toBe(false);
    }
  });
});

describe("taskBlockProps", () => {
  it("returns an unchecked taskItem block bound to the subtask", () => {
    expect(taskBlockProps("s1")).toEqual({ type: "taskItem", props: { subtaskId: "s1", checked: false } });
  });
});
