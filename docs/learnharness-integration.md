# LearnHarness handoff

ToDoMate's "Send to LearnHarness" action turns a finished task note into a Markdown file
that LearnHarness's existing notes-import pipeline can read as raw text. This is a
file-based handoff: no shared process, API key, or network call.

## Flow

1. In **Settings → LearnHarness integration**, add the subject names you use in
   LearnHarness and (optionally) set an absolute **handoff folder**. If left empty, native
   builds write to `<app-data-dir>/handoff`; browser dev mode keeps a virtual outbox in
   `localStorage`.
2. On a task, pick a **LearnHarness subject** (in the task row or the notes panel).
3. Write the note. Click **Mark done & prepare** — the note is stamped `ready for
   LearnHarness`.
4. Click **Send to LearnHarness**. ToDoMate writes a dated Markdown file to the handoff
   folder and records the status/path on the note.

A good use: create a task "Exam date for Biology", write `Exams are on 2027-01-10` in its
note, link it to the Biology subject, and hand it off. LearnHarness imports the note and
its running memory/knowledge graph picks up the exam date.

## File format

```markdown
---
title: "Exam date for Biology"
subject: "Biology"
date: 2026-12-01
tags: ["study"]
source: todomate
task_id: task_1
handed_off_at: 2026-11-19T10:00:00.000Z
daily_calorie_goal: 2000
---

# Exam date for Biology

Exams are on **2027-01-10**.
```

Notes are self-contained: attached images are embedded as Markdown image links with data
URLs, and LaTeX/Markdown is left raw for LearnHarness's extractor.

## Importing into LearnHarness

LearnHarness does **not** watch folders automatically. Choose one of its two real import
paths (from the LearnHarness repo):

**A. In-app picker (visible to the running app)**

Use the graph/notes **import / "Extract files"** action in LearnHarness and select the
`.md` files from the handoff folder. This goes through `/api/graph/import`, so the dev
server's status chips and graph view see the run immediately.

**B. CLI batch import**

```bash
cd path/to/LearnHarness/repo
npx tsx --env-file=.env.local scripts/import-notes.ts <handoff-folder>
```

This imports every `.md` / `.markdown` / `.txt` in the folder through the extraction
pipeline. Note the script's own caveat: it runs in its own process, so a concurrently
running dev server's per-process status registry will not show those runs (the graph
itself still gets the new nodes/chains).

## Notes / future work

- Handoff is manual by design in this foundation. A true auto-watcher (a small daemon that
  polls the folder and calls `/api/graph/import`) can be added later.
- Files are never deleted by ToDoMate after handoff; LearnHarness's `sources.json`
  bookkeeping keeps import identity by path.
- Browser dev mode cannot write real files (browser sandbox), so "Send" stores the file in
  a virtual outbox. Use the native build for real disk handoff.
