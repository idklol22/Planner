import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
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
import { useKeyboardInset } from "../../lib/keyboard";
import { MOTION_MS, prefersReducedMotion, usePresence } from "../../lib/motion";
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
import { canStartSwipeBack, shouldCommitSwipe, swipeBackProgress } from "./swipe";
import { PLACEHOLDER_TITLE, planSync, type BlockState, type Snapshot, type SubtaskState } from "./sync";

type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] };

function flatten(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.flatMap((b) => [b, ...flatten(b.children ?? [])]);
}

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((n: { type: string; text?: string }) => (n.type === "text" ? (n.text ?? "") : "")).join("");
}

/** 44px bar + a little breathing room; the bar adds the safe area itself. */
const BAR_SPACE = 52;

export function TaskPage({ taskId, closing = false }: { taskId: string; closing?: boolean }) {
  const { data } = useStore();
  const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt && !t.archivedAt);
  const keyboard = useKeyboardInset();
  const pageRef = useRef<HTMLDivElement>(null);

  // Left-edge swipe: while held, the page follows the finger one to one.
  const [swipe, setSwipe] = useState<{ x: number; opacity: number; snapping: boolean } | null>(null);
  const swipeStart = useRef<{ id: number; x: number; y: number; time: number; active: boolean } | null>(null);
  const snapTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(snapTimer.current), []);
  // Reopening during the slide-out reuses this instance (same key). Drop the
  // committed swipe offset or the page stays translated and dimmed for good.
  useEffect(() => {
    if (closing) return;
    window.clearTimeout(snapTimer.current);
    setSwipe(null);
  }, [closing]);

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

  /** A gesture that did not commit settles back with the same short spring. */
  function snapBack() {
    setSwipe({ x: 0, opacity: 1, snapping: true });
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(
      () => setSwipe(null),
      prefersReducedMotion() ? 0 : MOTION_MS.slow,
    );
  }

  function onSwipeDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // The photo viewer is a modal above this page; a drag on its backdrop must
    // not drag (or close) the page underneath.
    if (document.querySelector('[role="dialog"]')) return;
    if (swipeStart.current) return;
    const target = e.target as Element | null;
    const selection = window.getSelection();
    const startable = canStartSwipeBack(e.clientX, window.innerWidth, {
      selecting: !!selection && !selection.isCollapsed,
      // Text selection and the controls on the page own their own gestures.
      insideEditor: !!target?.closest?.(
        ".planner-editor, .note-editor, button, input, textarea, select, a, [contenteditable]",
      ),
    });
    if (!startable) return;
    window.clearTimeout(snapTimer.current);
    swipeStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, active: false };
  }

  function onSwipeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.active && Math.abs(dx) < 6) return;
    // A selection made during the drag always wins over going back.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      swipeStart.current = null;
      if (start.active) snapBack();
      return;
    }
    const progress = swipeBackProgress(dx, dy, window.innerWidth);
    if (!progress) {
      // Vertical: hand the gesture back to the page's own scrolling.
      swipeStart.current = null;
      if (start.active) snapBack();
      return;
    }
    if (!start.active) {
      start.active = true;
      // Lock the horizontal gesture to this element so a stray pointercancel
      // cannot leave the page half-dragged. touch-action: pan-y keeps scrolling.
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    setSwipe({ x: dx, opacity: 1 - progress * 0.12, snapping: false });
  }

  function onSwipeCancel(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (start?.id !== e.pointerId) return;
    swipeStart.current = null;
    if (start.active) snapBack();
  }

  function onSwipeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || start.id !== e.pointerId) return;
    swipeStart.current = null;
    if (!start.active) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const velocityX = dx / Math.max(1, e.timeStamp - start.time);
    if (shouldCommitSwipe(dx, dy, window.innerWidth, velocityX)) {
      // Hold the current offset: App's slide-out starts from exactly here.
      setSwipe({ x: dx, opacity: 1, snapping: false });
      goBack();
    } else {
      snapBack();
    }
  }

  const pageStyle = {
    paddingBottom: keyboard ? BAR_SPACE + keyboard : `calc(${BAR_SPACE}px + var(--safe-bottom))`,
    "--swipe-x": `${swipe?.x ?? 0}px`,
    "--swipe-opacity": swipe?.opacity ?? 1,
  } as CSSProperties;
  const swipeClass = closing
    ? ""
    : swipe?.snapping
      ? " is-snapping"
      : swipe
        ? " is-swiping"
        : "";

  return (
    <div
      ref={pageRef}
      className={`task-page fixed inset-0 z-50 max-w-[100vw] overflow-x-hidden overflow-y-auto overscroll-contain bg-canvas${closing ? " task-page--closing" : ""}${swipeClass}`}
      style={pageStyle}
      onPointerDown={onSwipeDown}
      onPointerMove={onSwipeMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeCancel}
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
        <TaskDocument key={task.id} task={task} keyboard={keyboard} pageRef={pageRef} closing={closing} />
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

/** Memoised so the swipe's per-frame state on the page shell never re-renders
 *  the editor (which would move the cursor). */
const TaskDocument = memo(function TaskDocument({
  task,
  keyboard,
  pageRef,
  closing,
}: {
  task: Task;
  keyboard: number;
  pageRef: RefObject<HTMLDivElement | null>;
  closing: boolean;
}) {
  const { data, actions } = useStore();
  const [title, setTitle] = useState(task.title);
  const titleRef = useRef(title);
  titleRef.current = title;
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const commitTitleRef = useRef<() => void>(() => {});
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
  const pendingSave = useRef<PlannerEditor | null>(null);

  const notify = useToast();
  const sync = useSync();
  const clientRef = useRef(sync.client);
  clientRef.current = sync.client;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // The viewer zooms from the tapped photo and zooms back on close. Keeping the
  // last target in a ref lets the image stay on screen through its exit.
  type Viewer = {
    url: string;
    blockId: string;
    rect: { left: number; top: number; width: number; height: number };
  };
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const viewerPresence = usePresence(!!viewer, MOTION_MS.base);
  const viewerRef = useRef<Viewer | null>(null);
  if (viewer) viewerRef.current = viewer;
  const shownViewer = viewer ?? viewerRef.current;
  const viewerImageRef = useRef<HTMLImageElement>(null);
  const [flip, setFlip] = useState<{ dx: number; dy: number; scale: number } | null>(null);

  useLayoutEffect(() => {
    if (!viewerPresence.mounted || !shownViewer || flip) return;
    if (prefersReducedMotion()) {
      setFlip({ dx: 0, dy: 0, scale: 1 });
      return;
    }
    const image = viewerImageRef.current;
    if (!image) return;
    const to = image.getBoundingClientRect();
    const from = shownViewer.rect;
    const scale = to.width > 0 ? Math.max(0.05, Math.min(1, from.width / to.width)) : 1;
    setFlip({
      dx: from.left + from.width / 2 - (to.left + to.width / 2),
      dy: from.top + from.height / 2 - (to.top + to.height / 2),
      scale,
    });
  }, [viewerPresence.mounted, shownViewer, flip]);

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

  const saveNoteNow = useCallback(
    (editor: PlannerEditor) => {
      const blocks = editor.document;
      actionsRef.current.updateNoteBlocks(task.id, blocks as unknown[], blocksToMarkdown(blocks));
    },
    [task.id],
  );
  const saveNoteRef = useRef(saveNoteNow);
  saveNoteRef.current = saveNoteNow;

  /** Write the pending document now, once. Backgrounding, an exit and a direct
   *  switch to another task all go through here instead of dropping the timer. */
  const flushNote = useCallback(() => {
    if (!pendingSave.current) return;
    window.clearTimeout(saveTimer.current);
    const editor = pendingSave.current;
    pendingSave.current = null;
    saveNoteRef.current(editor);
  }, []);

  const persist = useCallback(
    (editor: PlannerEditor) => {
      window.clearTimeout(saveTimer.current);
      pendingSave.current = editor;
      saveTimer.current = window.setTimeout(flushNote, 500);
    },
    [flushNote],
  );

  // Leaving the page starts a 240ms slide-out; flush at its start so the last
  // keystroke is not lost even if the unmount happens before the debounce.
  useEffect(() => {
    if (closing) flushNote();
  }, [closing, flushNote]);

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

  // iOS suspends timers when the app is backgrounded or the web view is killed.
  // Save the pending document on hide/pagehide, and on unmount when a deep link
  // switches straight from one task to another (no `closing` frame in that case).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNote();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNote);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNote);
      flushNote();
    };
  }, [flushNote]);

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
    const rect = image.getBoundingClientRect();
    setFlip(null);
    setViewer({
      url: image.currentSrc || image.src,
      blockId,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  }

  function removeImage() {
    if (!viewer) return;
    editor.removeBlocks([viewer.blockId]);
    setViewer(null);
    persist(editor);
  }

  const titleSaved = useRef(task.title);
  function commitTitle() {
    const clean = titleRef.current.trim();
    if (!clean) {
      titleRef.current = task.title;
      setTitle(task.title);
    } else if (clean !== task.title && clean !== titleSaved.current) {
      titleSaved.current = clean;
      actions.updateTask(task.id, { title: clean });
    }
  }
  commitTitleRef.current = commitTitle;

  // iOS does not always blur a textarea when the user taps empty space. Flush
  // the title on any outside touch, on backgrounding and on the way out; the
  // saved-value guard keeps the blur that follows from writing it twice.
  useEffect(() => {
    const flush = () => {
      const input = titleInputRef.current;
      if (document.activeElement === input) input?.blur(); // its onBlur commits
      else commitTitleRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("textarea[aria-label='Task title']")) return;
      if (document.activeElement === titleInputRef.current) flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      commitTitleRef.current();
    };
  }, []);

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
            ref={titleInputRef}
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

      {viewerPresence.mounted && shownViewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className={`photo-viewer ${viewerPresence.closing ? "is-closing" : ""}`}
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
            ref={viewerImageRef}
            src={shownViewer.url}
            alt="Note photo"
            className={`photo-viewer-image ${flip ? "is-ready" : ""}`}
            style={
              {
                "--photo-dx": `${flip?.dx ?? 0}px`,
                "--photo-dy": `${flip?.dy ?? 0}px`,
                "--photo-scale": flip?.scale ?? 1,
              } as CSSProperties
            }
            onClick={(event) => event.stopPropagation()}
          />
          <button type="button" onClick={removeImage} className="photo-viewer-remove">
            Remove
          </button>
        </div>
      )}
    </>
  );
});
