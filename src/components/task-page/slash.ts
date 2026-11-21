import { filterSuggestionItems } from "@blocknote/core/extensions";

export const TASK_SLASH_TITLE = "Task";
export const taskSlashAliases = ["task", "todo", "subtask", "check"];

/** The descriptor used for matching; the editor supplies the icon when rendering. */
const descriptor = {
  title: TASK_SLASH_TITLE,
  aliases: taskSlashAliases,
  group: "Basic blocks",
  subtext: "A real subtask you can tick off",
};

/** Case-insensitive match over the title/aliases, tolerant of a leading `/`. */
export function taskSlashItemMatches(query: string): boolean {
  const q = query.trim().replace(/^\/+/, "");
  if (!q) return false;
  return filterSuggestionItems([descriptor], q).length > 0;
}

/** The block inserted by the /task slash item, bound to a real subtask. */
export function taskBlockProps(subtaskId: string) {
  return { type: "taskItem", props: { subtaskId, checked: false } };
}
