import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, Repeat, Shapes } from "lucide-react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "katex/dist/katex.min.css";
import "./task-page.css";
import { TASK_KINDS, type Task } from "../../domain/model";
import { parseDays, REPEAT_OPTIONS } from "../../domain/recurrence";
import { activeCategories } from "../../domain/tasks";
import { useStore } from "../../state/store";
import { catColor } from "../../theme/store";
import { FlowerCheck } from "../Flower";
import { blocksToMarkdown } from "./markdown";
import { goBack } from "./route";
import { matchInlineMath } from "./math";
import { schema, type PlannerEditor } from "./schema";
import { PLACEHOLDER_TITLE, planSync, type BlockState, type Snapshot, type SubtaskState } from "./sync";

type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] };

function flatten(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.flatMap((b) => [b, ...flatten(b.children ?? [])]);
}

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((n: { type: string; text?: string }) => (n.type === "text" ? (n.text ?? "") : "")).join("");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function TaskPage({ taskId }: { taskId: string }) {
  const { data } = useStore();
  const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Let BlockNote's own menus and the maths input consume Escape first.
      if (document.querySelector(".bn-suggestion-menu, .bn-formatting-toolbar, .mantine-Menu-dropdown")) return;
      if ((e.target as HTMLElement | null)?.classList?.contains("math-input")) return;
      e.preventDefault();
      goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="task-page fixed inset-0 z-50 overflow-y-auto bg-canvas"
      // Keep the day page's single-key shortcuts (n, t, arrows) from firing underneath.
      onKeyDown={(e) => e.key !== "Escape" && e.nativeEvent.stopPropagation()}
    >
      <div className="sticky top-0 z-10 bg-scrim backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center px-4 md:px-0">
          <button
            onClick={goBack}
            aria-label="Back to day"
            title="Back (Esc)"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/10 hover:text-ink active:scale-90"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      </div>
      {task ? (
        <TaskDocument key={task.id} task={task} />
      ) : (
        <div className="mx-auto max-w-[720px] px-4 pt-16 text-muted">This task no longer exists.</div>
      )}
    </div>
  );
}

function withAfterBasic<T extends { group?: string }>(items: T[], extra: T): T[] {
  let at = -1;
  items.forEach((item, i) => item.group === "Basic blocks" && (at = i));
  const out = [...items];
  out.splice(at + 1 || out.length, 0, extra);
  return out;
}

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink/[0.06] px-2.5 text-[13.5px] text-muted outline-none transition-colors hover:bg-ink/[0.1] hover:text-ink focus:bg-ink/[0.1] focus:text-ink";

function TaskDocument({ task }: { task: Task }) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState(task.title);
  const editorRef = useRef<PlannerEditor | null>(null);
  const subs = useMemo(() => data.tasks.filter((t) => t.parentId === task.id), [data.tasks, task.id]);

  // Always-fresh views for async callbacks.
  const subsRef = useRef(subs);
  subsRef.current = subs;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  /** What both sides agreed on last (subtask id -> title/done). */
  const lastRef = useRef(new Map<string, Snapshot>());
  /** Changes we pushed that the store has not reflected yet. */
  const optimistic = useRef(new Map<string, SubtaskState>());
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    actionsRef.current.ensureNote(task.id);
  }, [task.id]);

  const persist = useCallback(
    (editor: PlannerEditor) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const blocks = editor.document;
        actionsRef.current.updateNoteBlocks(task.id, blocks as unknown[], blocksToMarkdown(blocks));
      }, 500);
    },
    [task.id],
  );

  const runSync = useCallback((editor: PlannerEditor) => {
    const store = actionsRef.current;
    const view = new Map<string, SubtaskState>();
    for (const s of subsRef.current) view.set(s.id, { id: s.id, title: s.title, done: s.done, deleted: !!s.deletedAt });
    for (const [id, o] of optimistic.current) {
      const real = view.get(id);
      if (real && real.title === o.title && real.done === o.done) optimistic.current.delete(id);
      else view.set(id, o);
    }

    const blocks = flatten(editor.document as unknown as AnyBlock[]).filter((b) => b.type === "taskItem");
    const states: BlockState[] = blocks.map((b) => ({
      blockId: b.id,
      subtaskId: String(b.props?.subtaskId ?? ""),
      title: plainText(b.content),
      checked: !!b.props?.checked,
    }));
    const plan = planSync(states, [...view.values()], lastRef.current);

    for (const c of plan.create) {
      const id = store.addSubtask(task.id, c.title);
      if (!id) continue;
      optimistic.current.set(id, { id, title: c.title, done: false });
      plan.next.set(id, { title: c.title, done: false });
      editor.updateBlock(c.blockId, { type: "taskItem", props: { subtaskId: id } } as never);
    }
    for (const u of plan.toStore) {
      if (u.title !== undefined) store.updateTask(u.id, { title: u.title });
      const current = view.get(u.id);
      if (u.done !== undefined && current && current.done !== u.done) store.toggleTask(u.id);
      optimistic.current.set(u.id, {
        id: u.id,
        title: u.title ?? current?.title ?? "",
        done: u.done ?? current?.done ?? false,
      });
    }
    for (const u of plan.toBlocks) {
      const patch: Record<string, unknown> = { type: "taskItem" };
      if (u.title !== undefined) patch.content = u.title;
      if (u.checked !== undefined) patch.props = { checked: u.checked };
      editor.updateBlock(u.blockId, patch as never);
    }
    for (const id of plan.gone) store.deleteTask(id);
    if (plan.orphaned.length) editor.removeBlocks(plan.orphaned);
    lastRef.current = plan.next;
  }, [task.id]);

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: Array.isArray(task.note?.blocks) && task.note.blocks.length ? (task.note.blocks as never) : undefined,
      uploadFile: fileToDataUrl,
      placeholders: { default: "Write something, or type '/' for commands" },
    },
    [task.id],
  );
  editorRef.current = editor;

  // Seed the sync snapshot from the document as loaded, then adopt store values.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      const note = task.note;
      if (note && !note.blocks?.length && note.content.trim()) {
        const parsed = await editor.tryParseMarkdownToBlocks(note.content);
        editor.replaceBlocks(editor.document, parsed);
      }
      for (const b of flatten(editor.document as unknown as AnyBlock[])) {
        if (b.type !== "taskItem") continue;
        const sub = subsRef.current.find((s) => s.id === b.props?.subtaskId);
        if (sub) lastRef.current.set(sub.id, { title: plainText(b.content), done: !!b.props?.checked });
      }
      runSync(editor);
    })();
  }, [editor, runSync, task.note]);

  // Store -> editor: subtask edited elsewhere (e.g. in the day view).
  useEffect(() => {
    if (seeded.current) runSync(editor);
  }, [subs, editor, runSync]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  function handleChange() {
    // `$...$` -> inline math node.
    const tt = editor._tiptapEditor;
    const { from, empty, $from } = tt.state.selection;
    if (empty && $from.parent.isTextblock) {
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
      const hit = before.endsWith("$") ? matchInlineMath(before) : null;
      if (hit) {
        tt.chain().deleteRange({ from: from - hit.length, to: from }).run();
        editor.insertInlineContent([{ type: "math", props: { latex: hit.latex } } as never, " "]);
      }
    }
    runSync(editor);
    persist(editor);
  }

  function commitTitle() {
    const clean = title.trim();
    if (!clean) setTitle(task.title);
    else if (clean !== task.title) actions.updateTask(task.id, { title: clean });
  }

  const category = data.categories.find((c) => c.id === task.categoryId);
  const color = category ? catColor(category.color) : "var(--accent)";
  const cats = activeCategories(data.categories);
  const repeatValue = task.rrule?.startsWith("days:") ? "custom" : (task.rrule ?? "");

  return (
    <article className="mx-auto w-full max-w-[720px] px-4 pb-40 pt-6 md:px-0 md:pt-10">
      <div className="flex items-start gap-3">
        <div className="pt-[0.55rem]">
          <FlowerCheck checked={task.done} color={color} onToggle={() => actions.toggleTask(task.id)} size={34} />
        </div>
        <textarea
          value={title}
          rows={1}
          placeholder="Untitled"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
              editor.focus();
            }
          }}
          aria-label="Task title"
          style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.025em" }}
          className={`min-w-0 flex-1 resize-none bg-transparent font-bold tracking-[-0.025em] outline-none [field-sizing:content] placeholder:text-ink/25 ${
            task.done ? "text-ink/40 line-through decoration-ink/25" : ""
          }`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pl-0 md:pl-[46px]">
        <label className={chip} style={{ color: category ? color : undefined }}>
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <select
            aria-label="Category"
            value={task.categoryId ?? ""}
            onChange={(e) => actions.updateTask(task.id, { categoryId: e.target.value || null })}
            className="max-w-[160px] cursor-pointer bg-transparent outline-none"
          >
            <option value="" className="bg-raised text-ink">
              No category
            </option>
            {cats.map((c) => (
              <option key={c.id} value={c.id} className="bg-raised text-ink">
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={chip}>
          <CalendarDays size={14} />
          <input
            type="date"
            aria-label="Date"
            value={task.date}
            onChange={(e) => e.target.value && actions.updateTask(task.id, { date: e.target.value })}
            className="bg-transparent outline-none"
          />
        </label>
        <label className={chip}>
          <Clock size={14} />
          <input
            type="time"
            aria-label="Time"
            value={task.time ?? ""}
            onChange={(e) => actions.updateTask(task.id, { time: e.target.value || undefined })}
            className="bg-transparent outline-none"
          />
        </label>
        <label className={chip}>
          <Repeat size={14} />
          <select
            aria-label="Repeat"
            value={repeatValue}
            onChange={(e) =>
              actions.updateTask(task.id, {
                rrule: e.target.value === "custom" ? "days:1,3,5" : e.target.value || undefined,
              })
            }
            className="cursor-pointer bg-transparent outline-none"
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-raised text-ink">
                {o.label}
              </option>
            ))}
            <option value="custom" className="bg-raised text-ink">
              {task.rrule?.startsWith("days:") ? `Days: ${parseDays(task.rrule).join(",")}` : "Custom days"}
            </option>
          </select>
        </label>
        <label className={chip}>
          <Shapes size={14} />
          <select
            aria-label="Kind"
            value={task.kind}
            onChange={(e) => actions.updateTask(task.id, { kind: e.target.value as Task["kind"] })}
            className="cursor-pointer bg-transparent capitalize outline-none"
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k} className="bg-raised capitalize text-ink">
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <BlockNoteView
          editor={editor}
          theme="dark"
          slashMenu={false}
          className="planner-editor"
          onChange={handleChange}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                withAfterBasic(getDefaultReactSlashMenuItems(editor), 
                  {
                    title: "Task",
                    aliases: ["task", "todo", "subtask", "check"],
                    group: "Basic blocks",
                    subtext: "A real subtask you can tick off",
                    icon: <span className="text-[14px]">&#9744;</span>,
                    onItemClick: () => {
                      const id = actionsRef.current.addSubtask(task.id, PLACEHOLDER_TITLE);
                      if (!id) return;
                      optimistic.current.set(id, { id, title: PLACEHOLDER_TITLE, done: false });
                      lastRef.current.set(id, { title: PLACEHOLDER_TITLE, done: false });
                      insertOrUpdateBlockForSlashMenu(editor, {
                        type: "taskItem",
                        props: { subtaskId: id, checked: false },
                      } as never);
                    },
                  }),
                query,
              )
            }
          />
        </BlockNoteView>
      </div>
    </article>
  );
}
