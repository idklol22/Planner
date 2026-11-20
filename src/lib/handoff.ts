import { toISODate } from "../domain/dates";
import type { Note, Settings, Task } from "../domain/model";

export interface HandoffPayload {
  fileName: string;
  markdown: string;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

function yaml(value: string): string {
  return JSON.stringify(value ?? "");
}

/** Turn a finished task note into a self-contained Markdown file that
 *  LearnHarness's notes-import pipeline can read as raw text. */
export function buildHandoffMarkdown(
  task: Task,
  note: Note,
  settings: Settings,
  /** LearnHarness subject linked through the task's category. */
  subject: string | null,
  now: Date = new Date(),
): HandoffPayload {
  const imageBlock = note.images.length
    ? note.images
        .map((image) => `![${image.name}](${image.dataUrl})`)
        .join("\n\n")
    : "";
  const body = [note.content.trim(), imageBlock].filter(Boolean).join("\n\n");

  const frontmatter = [
    "---",
    `title: ${yaml(task.title)}`,
    `subject: ${yaml(subject ?? "unfiled")}`,
    `date: ${task.date}`,
    `kind: ${task.kind}`,
    "source: planner",
    `task_id: ${task.id}`,
    `handed_off_at: ${now.toISOString()}`,
    `daily_calorie_goal: ${settings.dailyCalorieGoal}`,
    "---",
  ].join("\n");

  const markdown = [
    frontmatter,
    "",
    `# ${task.title}`,
    "",
    body || "(no note content)",
    "",
  ].join("\n");

  return {
    fileName: `${toISODate(now)}-${slugify(task.title)}.md`,
    markdown,
  };
}
