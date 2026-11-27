import { describe, expect, it, vi } from "vitest";
import { type Category, type Note, type Settings, type Task } from "../domain/model";
import type { HarnessNote } from "./harness-types";
import { expandFileRefs, FILE_REF_PREFIX, memoryFileStore, type FileStore } from "./note-files";
import {
  buildApiMarkdown,
  buildHandoffMarkdown,
  deliverDueNote,
  dueHandoffs,
  type DueHandoff,
  noteHash,
  slugify,
} from "./handoff";

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
    const todayUnfinished = withNote(
      { date: "2026-11-20", done: false, completedAt: undefined },
      { updatedAt: "2026-11-20T11:59:30.000Z" }, // edited 30 s ago: still inside the debounce
    );
    const tasks = [unlinked, deleted, { ...task, note: null }, todayUnfinished];

    expect(dueHandoffs(tasks, [category], now, lastRun)).toEqual([]);
  });
});

describe("dueHandoffs: send on edit", () => {
  const now = "2026-11-20T12:00:00.000Z";
  const open = (notePatch: Partial<Note>) =>
    withNote({ date: "2026-11-20", done: false, completedAt: undefined }, notePatch);

  it("waits 60 s after the last edit, then sends with finished = task.done", () => {
    const recent = open({ updatedAt: "2026-11-20T11:59:30.000Z" });
    const quiet = open({ updatedAt: "2026-11-20T11:58:30.000Z" });
    expect(dueHandoffs([recent], [category], now)).toEqual([]);
    const due = dueHandoffs([quiet], [category], now);
    expect(due).toHaveLength(1);
    expect(due[0].finished).toBe(false);
    expect(due[0].hash).toEqual(expect.any(String));
  });

  it("does not re-send an unchanged note, but sends it once the content changes", () => {
    const first = dueHandoffs([open({ updatedAt: "2026-11-20T10:00:00.000Z" })], [category], now)[0];
    const sent = open({
      updatedAt: "2026-11-20T11:00:00.000Z",
      handoff: { status: "sent", sentAt: "2026-11-20T11:01:00.000Z", finished: false, hash: first.hash },
    });
    expect(dueHandoffs([sent], [category], now)).toEqual([]);
    const edited = { ...sent, note: { ...sent.note!, content: "New thought", updatedAt: "2026-11-20T11:30:00.000Z" } };
    expect(dueHandoffs([edited], [category], now)).toHaveLength(1);
  });

  it("sends on completion immediately, even inside the debounce", () => {
    const done = withNote(
      { date: "2026-11-20", done: true, completedAt: "2026-11-20T11:59:50.000Z" },
      { updatedAt: "2026-11-20T11:59:40.000Z" },
    );
    expect(dueHandoffs([done], [category], now)).toHaveLength(1);
  });

  it("skips notes with no content", () => {
    expect(dueHandoffs([open({ content: "  ", images: [], updatedAt: "2026-11-20T10:00:00.000Z" })], [category], now)).toEqual([]);
  });

  it("schedules file refs untouched and hashes the unexpanded text", () => {
    const fileHash = "a".repeat(64);
    const content = `Photo ![snapshot](planner-file:${fileHash})`;
    const noteWithPhoto = open({ content, updatedAt: "2026-11-20T10:00:00.000Z" });
    const due = dueHandoffs([noteWithPhoto], [category], now);

    expect(due).toHaveLength(1);
    expect(due[0].markdown).toContain(`planner-file:${fileHash}`);
    expect(due[0].hash).toBe(
      noteHash(noteWithPhoto.title, noteWithPhoto.date, `${content}\n\n![syllabus.png](data:image/png;base64,AAA)`),
    );
  });
});

describe("handoff photo embedding", () => {
  it("still expands local file refs into data URLs when the note is sent", async () => {
    const fileHash = "b".repeat(64);
    const ref = `${FILE_REF_PREFIX}${fileHash}`;
    const content = `Syllabus ![page](${ref})`;
    const noteWithPhoto = withNote(
      { date: "2026-11-20", done: false, completedAt: undefined },
      { content, updatedAt: "2026-11-20T10:00:00.000Z" },
    );
    const due = dueHandoffs([noteWithPhoto], [category], "2026-11-20T12:00:00.000Z");

    expect(due).toHaveLength(1);
    // The scheduler keeps the ref; expansion happens on the way out, not at rest.
    expect(due[0].markdown).toContain(ref);
    const store = memoryFileStore([
      {
        hash: fileHash,
        blob: new Blob(["img"], { type: "image/png" }),
        mime: "image/png",
        name: "page.png",
      },
    ]);
    const embedded = await expandFileRefs(due[0].markdown, store);
    expect(embedded).toContain(`data:image/png;base64,${btoa("img")}`);
    expect(embedded).not.toContain(ref);
  });
});

describe("hand-off with missing local photos", () => {
  const missingHash = "c".repeat(64);
  const presentHash = "d".repeat(64);

  function dueNote(externalId: string, markdown: string, title = "Exam date for Biology"): DueHandoff {
    return {
      externalId,
      subjectId: "subject-bio",
      title,
      date: "2026-12-01",
      markdown,
      finished: true,
      hash: `hash-${externalId}`,
    };
  }

  function storeWith(...hashes: string[]): FileStore {
    return memoryFileStore(
      hashes.map((hash) => ({
        hash,
        blob: new Blob(["photo"], { type: "image/jpeg" }),
        mime: "image/jpeg",
        name: "photo.jpg",
      })),
    );
  }

  function delivery(store: FileStore, warned = new Set<string>()) {
    return {
      store,
      warned,
      sendNote: vi.fn(async (_note: HarnessNote) => "cmd-1"),
      recordHandoff: vi.fn(),
      notify: vi.fn(),
    };
  }

  it("blocks only the note with a missing photo and still sends the other one", async () => {
    const store = storeWith(presentHash);
    const io = delivery(store);
    const blocked = dueNote(
      "task_blocked",
      `Photo ![missing](planner-file:${missingHash})`,
      "Photos for Monday",
    );
    const good = dueNote("task_good", `Photo ![ok](planner-file:${presentHash})`);

    expect(await deliverDueNote(blocked, io)).toBe("missing-photo");
    expect(await deliverDueNote(good, io)).toBe("sent");

    expect(io.sendNote).toHaveBeenCalledTimes(1);
    expect(io.sendNote.mock.calls[0][0]).toMatchObject({ externalId: "task_good", markdown: expect.any(String) });
    expect(io.sendNote.mock.calls[0][0].markdown).toContain(`data:image/jpeg;base64,${btoa("photo")}`);
    expect(io.sendNote.mock.calls[0][0].markdown).not.toContain("data:image/svg+xml");
    expect(io.recordHandoff).toHaveBeenCalledTimes(1);
    expect(io.recordHandoff).toHaveBeenCalledWith(
      "task_good",
      expect.objectContaining({ hash: "hash-task_good", commandId: "cmd-1" }),
    );
    expect(io.notify).toHaveBeenCalledWith(
      'Not sent: a photo in "Photos for Monday" is not on this device.',
      "error",
    );
  });

  it("retries the blocked note by itself once the photo returns or its ref is removed", async () => {
    const store = storeWith();
    const io = delivery(store);
    const withRef = dueNote("task_1", `Photo ![x](planner-file:${missingHash})`);

    expect(await deliverDueNote(withRef, io)).toBe("missing-photo");
    expect(io.sendNote).not.toHaveBeenCalled();
    expect(io.recordHandoff).not.toHaveBeenCalled();

    // The photo arrives on this device: the very same note now goes out.
    await store.put({
      hash: missingHash,
      blob: new Blob(["back"], { type: "image/jpeg" }),
      mime: "image/jpeg",
      name: "photo.jpg",
    });
    expect(await deliverDueNote(withRef, io)).toBe("sent");
    expect(io.sendNote).toHaveBeenCalledTimes(1);
    expect(io.sendNote.mock.calls[0][0].markdown).toContain(`data:image/jpeg;base64,${btoa("back")}`);

    // Alternatively, removing the missing ref makes the note sendable again.
    const withoutRef = dueNote("task_2", "Photo removed, text kept");
    expect(await deliverDueNote(withoutRef, io)).toBe("sent");
    expect(io.sendNote).toHaveBeenCalledTimes(2);
    expect(io.sendNote.mock.calls[1][0].markdown).toBe("Photo removed, text kept");
  });

  it("shows one error toast per task per session, even across retries", async () => {
    const io = delivery(storeWith());
    const first = dueNote("task_1", `![x](planner-file:${missingHash})`);
    const second = dueNote("task_1", `![y](planner-file:${"e".repeat(64)})`);
    const other = dueNote("task_2", `![z](planner-file:${"f".repeat(64)})`, "Other task");

    expect(await deliverDueNote(first, io)).toBe("missing-photo");
    expect(await deliverDueNote(first, io)).toBe("missing-photo");
    expect(await deliverDueNote(second, io)).toBe("missing-photo");
    expect(io.notify).toHaveBeenCalledTimes(1);

    expect(await deliverDueNote(other, io)).toBe("missing-photo");
    expect(io.notify).toHaveBeenCalledTimes(2);
    expect(io.notify.mock.calls[1][0]).toBe(
      'Not sent: a photo in "Other task" is not on this device.',
    );
    expect(io.sendNote).not.toHaveBeenCalled();
  });

  it("does not queue a command when the photo store throws", async () => {
    const broken: FileStore = {
      get: async () => {
        throw new Error("storage blocked");
      },
      put: async () => {},
    };
    const io = delivery(broken);
    const note = dueNote("task_1", `![x](planner-file:${missingHash})`);

    expect(await deliverDueNote(note, io)).toBe("missing-photo");
    expect(io.sendNote).not.toHaveBeenCalled();
    expect(io.recordHandoff).not.toHaveBeenCalled();
    expect(io.notify).toHaveBeenCalledOnce();
  });
});
