# Planner: UI/UX and data design (v1, web first)

Reference: TodoMate (iOS). We keep its structure but not its exact look.
Web app first (installable PWA, phone and laptop). Tauri desktop and iOS come later from the same UI.

## Look
- True-black background (#000), surfaces #111 / #1a1a1a, white text, 60% and 40% white for secondary text.
- Font: Inter (already bundled). Big, friendly type: task titles 17px, pills 15px semibold, month title 22px bold.
- Each **category** has its own colour. The colour is used ONLY for the pill text, the checkbox fill and the calendar
  blobs. Everything else stays monochrome.
- The checkbox is a soft rounded "flower" (4 overlapping circles, SVG), grey when not done and filled with the
  category colour plus a white check when done.
- Pills: rounded-full, #1a1a1a background, a small category icon, the coloured name, and a black circular **+** button
  at the end.
- No ads, no stories row, no social features (TodoMate's friend avatars are left out).

## Screens
### Today / Day (home)
1. Header: date title (e.g. "Thu, 20 Nov"), and on the right a menu button and a **Month | Week** toggle.
2. **Calendar strip**: week view by default (M–S row), or a full month grid. Each day shows a flower blob that is empty
   grey when nothing is due, shows the count of open tasks inside it when tasks are left, and is filled in the colour
   of the day's main category with a ✓ when everything is done. The selected day's number sits in a white circle and
   today's in a grey circle. Weekend numbers are blue (Sat) and red (Sun). Swipe or ‹ › changes week/month.
3. **Category sections** for the selected day, in category order: the pill, then that day's tasks for the category.
   A category with no tasks that day shows just its pill, so you can add quickly.
4. Pressing **+** on a pill opens an inline input under it. Enter adds the task and keeps the input open for the next
   one. Escape closes it.
5. Task row: checkbox · title · small icons if it has a note / subtasks / a time / a deadline · a progress count for
   subtasks ("2/5"). Click the title to open the **task sheet**. Click the checkbox to toggle done (with a light
   haptic-style scale animation).
6. Bottom of the list: a dotted divider and a "List menu" (reorder categories, show completed, hide empty
   categories).

### Task sheet (side panel on desktop, bottom sheet on phone)
- Title (editable), category picker, date, optional time and duration, repeat (none / daily / weekdays / weekly /
  custom days), deadline flag, kind (`general`, `class`, `study`, `revisit`, `practice`, `research`, `meeting`).
- Subtasks: a checklist; each subtask can open its own note.
- **Note**: the existing Markdown editor (KaTeX, images) fills the rest of the sheet. A "Send to LearnHarness" status
  chip is shown when the category is linked to a Harness subject.
- Footer: delete, move to another day, duplicate.

### Categories (from the menu)
- List with drag-to-reorder, name, colour (12 preset colours), icon, "linked LearnHarness subject" (text for now),
  archive.

### Also kept from ToDoMate, restyled to match: Habits, Calories, Settings.
They move into the menu (drawer). The bottom tab bar on phone has Today, Calendar (month), Notes (all task notes,
searchable) and Menu.

## Data model (v1). The hub mirrors this exactly.
```
Category  { id, name, color /* hex */, icon?, order, linkedSubjectId: string|null, archived: boolean, createdAt, updatedAt }
Task      { id, title, date /* YYYY-MM-DD */, categoryId: string|null, parentId: string|null /* subtask */, order,
            done, completedAt?, time?: "HH:MM", durationMin?, rrule?: string /* "daily"|"weekdays"|"weekly"|"days:1,3,5" */,
            deadline: boolean, kind: "general"|"class"|"study"|"revisit"|"practice"|"research"|"meeting",
            note: Note|null, createdAt, updatedAt, deletedAt? }
Note      { (unchanged from ToDoMate) + updatedAt }
```
- `Heading` (per-day) is replaced by Category (persistent). Migration: each distinct heading title becomes a
  category, and tasks are mapped to it.
- Recurring tasks: one "template" task with an `rrule`. Occurrences are materialised per day lazily when that day is
  shown (a child copy with the same title, `parentId` = null, and a field `seriesId` = template id), so done-state is
  per day.
- Every record has `updatedAt` and a soft `deletedAt`, needed for sync (latest edit wins per record).

---

# v1.1 changes (owner feedback, 2026-11-20), replacing the earlier screens where they conflict

1. **One page.** Remove the drawer menu, the phone bottom tab bar and the separate Today/Calendar/Notes/Habits/Calories
   screens. The only screen is the Day page. A ☰ button (top-right) opens a small menu with **Categories** and
   **Settings** only.
2. **Calendar header**: `‹  [M|W]  ›`. The Month/Week toggle is a round button centred between the arrows (it shows
   "M" or "W", and clicking switches the strip between the week row and the month grid). The month title sits above
   or left as before.
3. **Habits = ghost suggestions.** A habit belongs to a category and has a schedule: `every day` from a start date,
   either until an end date or forever (optionally on certain weekdays). On days it applies, it shows under its
   category pill as a faded ("ghost") row with a dashed flower. Tap it → it becomes a real task for that day. If it is
   not added, it simply disappears after that day (nothing is stored). A category that has nothing but ghosts on
   a day still shows. Habits are created from the + menu on a pill ("Add as habit…") and edited in Categories.
4. **Task page (document), not a side sheet.** Clicking a task opens a full-page document view (route
   `#/task/<id>`, back arrow returns to the day): title, a small meta row (category, date, time, repeat, kind), then a
   Notion-like block editor (BlockNote): headings, lists, checklists, quotes, code, maths, and images (paste, drag or
   upload, stored as data URLs for now). Typing `/task` inserts a task block that is a real subtask (its checkbox and
   title sync with the subtask). Dictation comes later. The note stores BlockNote JSON plus a Markdown export.
5. **Calories on the Day page**: a slim bar under the calendar showing `1,240 / 2,000 kcal` with a progress line.
   Tap to type a number (with an optional label) and Enter adds it to the day's sum. Tapping the total lists today's
   entries (deletable). The Calendar month view shows a tiny kcal dot per day (green when within ±10% of goal).
   Summaries: a "Day summary" card appears at the bottom of the day after 21:00 or on past days (tasks done/total, kcal,
   categories worked on). A "Week summary" shows on Sundays and when opening the week view (tasks done, kcal average,
   days on goal, per-category counts).
6. **Hand-off to LearnHarness.** A task whose category is linked to a Harness subject sends its note when the task is
   completed, or at day end (first app open after midnight, for the previous day) if it isn't done, marked
   `finished: false`. It's sent again when the note changes after being sent. It goes through the Harness API (below);
   the handoff status chip on the task page shows not sent / sent / failed (retry).
7. **Categories → linked subject** is a dropdown of the real Harness subjects, fetched from the Harness API. Settings
   holds the Harness URL (default `http://localhost:3000`). If the Harness isn't reachable, the dropdown says so and
   keeps the saved link.

## Harness API used by the Planner (CORS-enabled for the Planner origin)
- `GET  /api/planner/subjects` → `{ subjects: [{ id, name, color, topics: [{ id, name }] }] }`
- `POST /api/planner/notes` `{ externalId, subjectId, topicId?, title, date, markdown, finished }` → stores or updates a
  text material in that subject named `<date> <title>.md`, upserted by `externalId` (the task id). Unfinished notes get
  a first line `> Unfinished notes (task not completed)`.
