import { describe, expect, it } from "vitest";
import type { Note, Settings, Task } from "../domain/model";
import { buildHandoffMarkdown, slugify } from "./handoff";

const task: Task = {
  id: "task_1",
  title: "Exam date for Biology",
  date: "2026-12-01",
  tags: ["study"],
  headingId: null,
  order: 0,
  done: true,
  linkedSubjectId: "Biology",
  note: null,
  createdAt: "2026-11-19T00:00:00.000Z",
};

const note: Note = {
  id: "note_1",
  taskId: "task_1",
  content: "Exams on **2027-01-10**. Review Chapter 4.",
  images: [
    { id: "img_1", name: "syllabus.png", dataUrl: "data:image/png;base64,AAA" },
  ],
  handoff: { status: "ready" },
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
};

const settings: Settings = {
  handoffFolder: "",
  learnharnessSubjects: ["Biology"],
  dailyCalorieGoal: 2000,
};

describe("handoff export", () => {
  it("slugifies titles", () => {
    expect(slugify("Exam date for Biology!")).toBe("exam-date-for-biology");
  });

  it("writes frontmatter, note body and images into a dated Markdown file", () => {
    const payload = buildHandoffMarkdown(
      task,
      note,
      settings,
      new Date(2026, 10, 19, 10, 0, 0),
    );

    expect(payload.fileName).toBe("2026-11-19-exam-date-for-biology.md");
    expect(payload.markdown).toContain('title: "Exam date for Biology"');
    expect(payload.markdown).toContain('subject: "Biology"');
    expect(payload.markdown).toContain("source: todomate");
    expect(payload.markdown).toContain("Exams on **2027-01-10**.");
    expect(payload.markdown).toContain("![syllabus.png](data:image/png;base64,AAA)");
  });
});
