import { describe, expect, it } from "vitest";
import { DEFAULT_HARNESS_URL, type Category, type Note, type Settings, type Task } from "../domain/model";
import { buildApiMarkdown, buildHandoffMarkdown, dueHandoffs, slugify } from "./handoff";

const task: Task = {
  id: "task_1",
  title: "Exam date for Biology",
  date: "2026-12-01",
  categoryId: "cat_1",
  parentId: null,
  order: 0,
  done: true,
  deadline: false,
  kind: "study",
  note: null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
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

const category: Category = {
  id: "cat_1",
  name: "Biology",
  color: "#FF6B6B",
  order: 0,
  linkedSubjectId: "subject-bio",
  linkedTopicId: "topic-cells",
  archived: false,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
};

const settings: Settings = {
  handoffFolder: "",
  learnharnessSubjects: ["Biology"],
  harnessUrl: DEFAULT_HARNESS_URL,
  dailyCalorieGoal: 2000,
};

function withNote(taskPatch: Partial<Task> = {}, notePatch: Partial<Note> = {}): Task {
  return { ...task, ...taskPatch, note: { ...note, ...notePatch } };
}

describe("legacy handoff export", () => {
  it("slugifies titles", () => {
    expect(slugify("Exam date for Biology!")).toBe("exam-date-for-biology");
  });

  it("writes frontmatter, note body and images into a dated Markdown file", () => {
    const payload = buildHandoffMarkdown(
      task,
      note,
      settings,
      "Biology",
      new Date(2026, 10, 19, 10, 0, 0),
    );

    expect(payload.fileName).toBe("2026-11-19-exam-date-for-biology.md");
    expect(payload.markdown).toContain('title: "Exam date for Biology"');
    expect(payload.markdown).toContain('subject: "Biology"');
    expect(payload.markdown).toContain("source: planner");
    expect(payload.markdown).toContain("Exams on **2027-01-10**.");
    expect(payload.markdown).toContain("![syllabus.png](data:image/png;base64,AAA)");
  });
});

describe("dueHandoffs", () => {
  const now = "2026-11-20T12:00:00.000Z";
  const lastRun = "2026-11-20T00:00:00.000Z";

  it("sends a task's note on completion with its linked subject and topic", () => {
    const completed = withNote(
      { done: true, completedAt: "2026-11-20T09:00:00.000Z" },
      { handoff: { status: "ready" } },
    );
    const due = dueHandoffs([completed], [category], now, lastRun);

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      externalId: "task_1",
      subjectId: "subject-bio",
      topicId: "topic-cells",
      title: "Exam date for Biology",
      date: "2026-12-01",
      finished: true,
    });
    expect(due[0].markdown).toContain("Exams on **2027-01-10**.");
    expect(due[0].markdown).not.toContain("Unfinished notes");
  });

  it("sends previous days' unfinished tasks with finished: false", () => {
    const unfinished = withNote({ date: "2026-11-19", done: false, completedAt: undefined });
    const due = dueHandoffs([unfinished], [category], now, lastRun);

    expect(due).toHaveLength(1);
    expect(due[0].finished).toBe(false);
    expect(due[0].markdown.startsWith("> Unfinished notes (task not completed)\n\n")).toBe(true);
  });

  it("does not repeat an unchanged unfinished handoff", () => {
    const sent = withNote(
      { date: "2026-11-19", done: false, completedAt: undefined },
      {
        updatedAt: "2026-11-19T08:00:00.000Z",
        handoff: { status: "sent", sentAt: "2026-11-20T07:00:00.000Z", finished: false },
      },
    );

    expect(dueHandoffs([sent], [category], now, lastRun)).toEqual([]);
  });

  it("sends the note again whenever it changes after being sent", () => {
    const edited = withNote(
      { completedAt: "2026-11-19T09:00:00.000Z" },
      {
        updatedAt: "2026-11-20T10:00:00.000Z",
        handoff: { status: "sent", sentAt: "2026-11-19T10:00:00.000Z", finished: true },
      },
    );
    const due = dueHandoffs([edited], [category], now, lastRun);

    expect(due).toHaveLength(1);
    expect(due[0].finished).toBe(true);
    expect(buildApiMarkdown(edited, edited.note!, true)).toContain("Review Chapter 4.");
  });

  it("re-sends a finished note when it was last handed off as unfinished", () => {
    const finishedLater = withNote(
      { completedAt: "2026-11-19T09:00:00.000Z" },
      { handoff: { status: "sent", sentAt: "2026-11-19T10:00:00.000Z", finished: false } },
    );
    const due = dueHandoffs([finishedLater], [category], now, lastRun);

    expect(due).toHaveLength(1);
    expect(due[0].finished).toBe(true);
  });

  it("skips unlinked, deleted, note-less and future tasks", () => {
    const unlinked = withNote(
      { completedAt: "2026-11-20T09:00:00.000Z", categoryId: "other" },
    );
    const deleted = withNote(
      { completedAt: "2026-11-20T09:00:00.000Z", deletedAt: "2026-11-20T10:00:00.000Z" },
    );
    const todayUnfinished = withNote({ date: "2026-11-20", done: false, completedAt: undefined });
    const tasks = [unlinked, deleted, { ...task, note: null }, todayUnfinished];

    expect(dueHandoffs(tasks, [category], now, lastRun)).toEqual([]);
  });
});
