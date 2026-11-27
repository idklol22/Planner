import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
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
import { addPhoto, resolveFileUrl, scheduleUploads, setFileHubClient } from "../../lib/note-files";
import { useStore } from "../../state/store";
import { useSync } from "../../state/sync";
import { useToast } from "../../state/toast";
import { catColor } from "../../theme/store";
import { TaskCheck } from "../TaskMark";
import { formatTaskDate } from "./format";
import { KeyboardBar } from "./KeyboardBar";
import { blocksToMarkdown } from "./markdown";
import { matchInlineMath, mathifyParsedBlocks } from "./math";
import { goBack } from "./route";
import { schema, type PlannerEditor } from "./schema";
import { TASK_SLASH_TITLE, taskBlockProps, taskSlashAliases } from "./slash";
import { PLACEHOLDER_TITLE, planSync, type BlockState, type Snapshot, type SubtaskState } from "./sync";

type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] };

function flatten(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.flatMap((b) => [b, ...flatten(b.children ?? [])]);
}

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((n: { type: string; text?: string }) => (n.type === "text" ? (n.text ?? "") : "")).join("");
}

/** Height of the on-screen keyboard, so the bar can sit just above it. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => {
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(hidden > 80 ? Math.round(hidden) : 0);
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}

/** 44px bar + a little breathing room; the bar adds the safe area itself. */
const BAR_SPACE = 52;

export function TaskPage({ taskId }: { taskId: string }) {
  const { data } = useStore();
  const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt && !t.archivedAt);
  const keyboard = useKeyboardInset();
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Let BlockNote's own menus and the maths input consume Escape first.
      if (document.querySelector(".bn-suggestion-menu, .mantine-Menu-dropdown")) return;
      if ((e.target as HTMLElement | null)?.classList?.contains("math-input")) return;
      e.preventDefault();
      goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={pageRef}
      className="task-page fixed inset-0 z-50 max-w-[100vw] overflow-x-hidden overflow-y-auto overscroll-contain bg-canvas"
      style={{ paddingBottom: keyboard ? BAR_SPACE + keyboard : `calc(${BAR_SPACE}px + var(--safe-bottom))` }}
      // Keep the day page's single-key shortcuts (n, t, arrows) from firing underneath.
      onKeyDown={(e) => e.key !== "Escape" && e.nativeEvent.stopPropagation()}
    >
      <div className="sticky top-0 z-10 bg-canvas pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center px-4 md:px-0">
          <button
            onClick={goBack}
            aria-label="Back to day"
            title="Back (Esc)"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink active:scale-90"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
      </div>
      {task ? (
        <TaskDocument key={task.id} task={task} keyboard={keyboard} pageRef={pageRef} />
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

function TaskDocument({
  task,
  keyboard,
  pageRef,
}: {
  task: Task;
  keyboard: number;
  pageRef: RefObject<HTMLDivElement | null>;
}) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState(task.title);
  const editorRef = useRef<PlannerEditor | null>(null);
  const subs = useMemo(
    () => data.tasks.filter((t) => t.parentId === task.id && !t.archivedAt),
    [data.tasks, task.id],
  );

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

  const notify = useToast();
  const sync = useSync();
  const clientRef = useRef(sync.client);
  clientRef.current = sync.client;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [viewer, setViewer] = useState<{ url: string; blockId: string } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  /** Block the cursor was in when a photo was chosen (the picker blurs the editor). */
  const insertAfter = useRef<string | undefined>(undefined);
  /** True once the notes have had focus, so a cursor position means something. */
  const wrote = useRef(false);
  const keyboardRef = useRef(keyboard);
  keyboardRef.current = keyboard;

  useEffect(() => {
    actionsRef.current.ensureNote(task.id);
  }, [task.id]);

  // Photos upload in the background: never awaited by typing or insertion.
  useEffect(() => {
    setFileHubClient(sync.client);
    if (sync.client) scheduleUploads(sync.client);
  }, [sync.client]);
  useEffect(() => {
    if (sync.client && sync.status.lastSyncedAt) scheduleUploads(sync.client);
  }, [sync.client, sync.status.lastSyncedAt]);
  useEffect(() => {
    const onOnline = () => scheduleUploads(clientRef.current);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  useEffect(() => {
    if (!viewer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setViewer(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [viewer]);

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
      // Paste/drop inserts an image block itself; returning the stored ref and
      // name overwrites the browser's original file name with the photo stamp.
      uploadFile: async (file) => {
        const { ref, name } = await addPhoto(file);
        return { props: { url: ref, name } };
      },
      resolveFileUrl: (url) => resolveFileUrl(url, clientRef.current),
      placeholders: { default: "Write something, or type '/' for commands" },
      // Plain Markdown pastes become real blocks, even alongside HTML.
      pasteHandler: ({ defaultPasteHandler }) =>
        defaultPasteHandler({ prioritizeMarkdownOverHTML: true, plainTextAsMarkdown: true }),
    },
    [task.id],
  );
  editorRef.current = editor;

  /** Keep the cursor above the bar when it moves, when typing, or when the keyboard opens. */
  const revealCursor = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    let coords: { top: number; bottom: number };
    try {
      const view = editor.prosemirrorView;
      coords = view.coordsAtPos(view.state.selection.from);
    } catch {
      return;
    }
    const bottom = window.innerHeight - keyboardRef.current - 44 - 8;
    if (coords.bottom > bottom) page.scrollTop += coords.bottom - bottom + 12;
    else if (coords.top < 64) page.scrollTop -= 64 - coords.top + 8;
  }, [editor, pageRef]);

  useEffect(() => editor.onSelectionChange(revealCursor), [editor, revealCursor]);
  useEffect(() => {
    if (keyboard) revealCursor();
  }, [keyboard, revealCursor]);

  // Seed the sync snapshot from the document as loaded, then adopt store values.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      const note = task.note;
      if (note && !note.blocks?.length && note.content.trim()) {
        const parsed = await editor.tryParseMarkdownToBlocks(note.content);
        editor.replaceBlocks(editor.document, mathifyParsedBlocks(parsed as unknown[]) as never);
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
    revealCursor();
  }

  /** Insert at the remembered cursor, then put a fresh empty line there and focus it. */
  function insertImages(images: { ref: string; name: string }[]) {
    if (!images.length) return;
    const blocks = [
      ...images.map(({ ref, name }) => ({ type: "image", props: { url: ref, name } })),
      { type: "paragraph" },
    ] as never[];
    const document = editor.document as unknown as AnyBlock[];
    const last = document[document.length - 1];
    const trailing = document.length > 1 && last?.type === "paragraph" && !plainText(last.content);
    const reference =
      insertAfter.current ?? document[document.length - (trailing ? 2 : 1)]?.id;
    let inserted: AnyBlock[];
    if (reference) {
      inserted = editor.insertBlocks(blocks, reference, "after") as unknown as AnyBlock[];
    } else {
      inserted = editor.replaceBlocks(editor.document, blocks).insertedBlocks as unknown as AnyBlock[];
    }
    insertAfter.current = undefined;
    const empty = inserted[inserted.length - 1];
    if (empty) {
      editor.setTextCursorPosition(empty.id, "start");
      editor.focus();
    }
    revealCursor();
    persist(editor);
  }

  async function addFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (!chosen.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const inserted: { ref: string; name: string }[] = [];
      for (const file of chosen) {
        try {
          const { ref, name } = await addPhoto(file);
          inserted.push({ ref, name });
        } catch (error) {
          notify(error instanceof Error ? error.message : "Could not add that photo.", "error");
        }
      }
      insertImages(inserted);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Remember the cursor before the native picker blurs the editor. */
  function openPicker(input: RefObject<HTMLInputElement | null>) {
    if (busyRef.current) return;
    try {
      insertAfter.current = wrote.current
        ? (editor.getTextCursorPosition().block as unknown as AnyBlock | undefined)?.id
        : undefined;
    } catch {
      insertAfter.current = undefined;
    }
    input.current?.click();
  }

  function openViewer(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const image = target.closest("img");
    const block = image?.closest('[data-content-type="image"]');
    const blockId = block?.closest("[data-id]")?.getAttribute("data-id");
    if (!image || !blockId) return;
    setViewer({ url: image.currentSrc || image.src, blockId });
  }

  function removeImage() {
    if (!viewer) return;
    editor.removeBlocks([viewer.blockId]);
    setViewer(null);
    persist(editor);
  }

  function commitTitle() {
    const clean = title.trim();
    if (!clean) setTitle(task.title);
    else if (clean !== task.title) actions.updateTask(task.id, { title: clean });
  }

  const category = data.categories.find((c) => c.id === task.categoryId);
  const color = category ? catColor(category.color) : "var(--color-accent)";
  const cats = activeCategories(data.categories);
  const repeatValue = task.rrule?.startsWith("days:") ? "custom" : (task.rrule ?? "");
  const repeatLabel = !repeatValue
    ? "Repeat"
    : repeatValue === "custom"
      ? `Days: ${parseDays(task.rrule ?? "").join(",")}`
      : (REPEAT_OPTIONS.find((o) => o.value === repeatValue)?.label ?? repeatValue);

  return (
    <>
      <article className="mx-auto w-full max-w-[720px] px-4 pt-6 md:px-0 md:pt-10">
        <div className="flex items-start gap-3">
          <div className="-ml-2 -mt-[5px]">
            <TaskCheck
              checked={task.done}
              color="var(--color-ink)"
              onToggle={() => actions.toggleTask(task.id)}
              size={28}
            />
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
            style={{ fontSize: 23, lineHeight: 1.25, fontWeight: 700, letterSpacing: "-0.02em" }}
            className={`min-w-0 flex-1 resize-none bg-transparent font-bold tracking-[-0.025em] outline-none [field-sizing:content] placeholder:text-ink/25 ${
              task.done ? "text-ink/40 line-through decoration-ink/25" : ""
            }`}
          />
        </div>

        <div className="properties mt-3 flex flex-wrap items-center gap-x-5 gap-y-0 pl-0 md:pl-[36px]">
          <label className="property-control">
            <span className="property-dot" style={{ background: color }} />
            <span className="max-w-[130px] truncate">{category?.name ?? "No category"}</span>
            <select
              aria-label="Category"
              value={task.categoryId ?? ""}
              onChange={(e) => actions.updateTask(task.id, { categoryId: e.target.value || null })}
              className="property-input"
            >
              <option value="">No category</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="property-control">
            <span>{task.date ? formatTaskDate(task.date) : "Add date"}</span>
            <input
              type="date"
              aria-label="Date"
              value={task.date}
              onChange={(e) => e.target.value && actions.updateTask(task.id, { date: e.target.value })}
              className="property-input"
            />
          </label>
          <label className="property-control">
            <span>{task.time || "Add time"}</span>
            <input
              type="time"
              aria-label="Time"
              value={task.time ?? ""}
              onChange={(e) => actions.updateTask(task.id, { time: e.target.value || undefined })}
              className="property-input"
            />
          </label>
          <label className="property-control">
            <span>{repeatLabel}</span>
            <select
              aria-label="Repeat"
              value={repeatValue}
              onChange={(e) =>
                actions.updateTask(task.id, {
                  rrule: e.target.value === "custom" ? "days:1,3,5" : e.target.value || undefined,
                })
              }
              className="property-input"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="custom">
                {task.rrule?.startsWith("days:") ? `Days: ${parseDays(task.rrule).join(",")}` : "Custom days"}
              </option>
            </select>
          </label>
          <label className="property-control capitalize">
            <span>{task.kind}</span>
            <select
              aria-label="Kind"
              value={task.kind}
              onChange={(e) => actions.updateTask(task.id, { kind: e.target.value as Task["kind"] })}
              className="property-input"
            >
              {TASK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div
            className="note-editor"
            onFocusCapture={() => (wrote.current = true)}
            onPointerDownCapture={(event) => {
              // Tapping a photo previews it; BlockNote keeps its own UI elsewhere.
              if ((event.target as Element).closest?.('[data-content-type="image"] img')) event.preventDefault();
            }}
            onClickCapture={(event) => {
              if ((event.target as Element).closest?.('[data-content-type="image"] img')) {
                event.preventDefault();
                event.stopPropagation();
                openViewer(event.target);
              }
            }}
          >
            <BlockNoteView
              editor={editor}
              theme="dark"
              slashMenu={false}
              formattingToolbar={false}
              sideMenu={false}
              emojiPicker={false}
              filePanel={false}
              tableHandles={false}
              className="planner-editor"
              onChange={handleChange}
            >
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) =>
                  filterSuggestionItems(
                    withAfterBasic(getDefaultReactSlashMenuItems(editor), {
                      title: TASK_SLASH_TITLE,
                      aliases: taskSlashAliases,
                      group: "Basic blocks",
                      subtext: "A real subtask you can tick off",
                      icon: <span className="text-[13px]">&#9744;</span>,
                      onItemClick: () => {
                        const id = actionsRef.current.addSubtask(task.id, PLACEHOLDER_TITLE);
                        if (!id) return;
                        optimistic.current.set(id, { id, title: PLACEHOLDER_TITLE, done: false });
                        lastRef.current.set(id, { title: PLACEHOLDER_TITLE, done: false });
                        insertOrUpdateBlockForSlashMenu(editor, taskBlockProps(id) as never);
                      },
                    }),
                    query,
                  )
                }
              />
            </BlockNoteView>
          </div>
        </div>
      </article>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={photosInput}
        type="file"
        accept="image/*"
        aria-label="Choose photos"
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <KeyboardBar
        editor={editor}
        keyboard={keyboard}
        busy={busy}
        onCamera={() => openPicker(cameraInput)}
        onPhotos={() => openPicker(photosInput)}
      />

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="photo-viewer"
          onClick={() => setViewer(null)}
        >
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setViewer(null)}
            className="photo-viewer-close"
          >
            <X size={22} />
          </button>
          <img
            src={viewer.url}
            alt="Note photo"
            className="photo-viewer-image"
            onClick={(event) => event.stopPropagation()}
          />
          <button type="button" onClick={removeImage} className="photo-viewer-remove">
            Remove
          </button>
        </div>
      )}
    </>
  );
}
