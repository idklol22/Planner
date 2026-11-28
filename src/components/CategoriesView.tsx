import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { countCategoryTasks } from "../domain/categories";
import { CATEGORY_COLORS, type Category } from "../domain/model";
import { resolveSwipe, SWIPE_MAX_PX, type SwipeState } from "../domain/swipe";
import { MOTION_MS, usePresence } from "../lib/motion";
import type { HarnessSubject } from "../lib/harness-types";
import { useStore } from "../state/store";
import { useSync } from "../state/sync";
import { useToast } from "../state/toast";
import { mirrorSubjects } from "../sync/mirror-view";
import { catColor } from "../theme/store";
import { Collapse } from "./Collapse";
import { useListExit } from "./listExit";
import { resolveInlineSave } from "./inlineSave";
import { Button } from "./ui";

const REST: SwipeState = { axis: null, dx: 0, action: null, settled: false };

interface DeleteTarget {
  cat: Category;
  count: number;
}

function CategoryRow({
  cat,
  index,
  total,
  expanded,
  onToggle,
  dragProps,
  dragging,
  onMove,
  onDelete,
  onArchive,
  subjects,
}: {
  cat: Category;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  dragProps: HTMLAttributes<HTMLDivElement>;
  dragging: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onArchive: () => void;
  subjects: HarnessSubject[];
}) {
  const { actions } = useStore();
  const [name, setName] = useState(cat.name);
  const blocked = useRef(false);
  const [swipe, setSwipe] = useState<SwipeState>(REST);
  const [revealed, setRevealed] = useState(false);
  const [moving, setMoving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  /** A sideways gesture must not also fire the button tap it ends with. */
  const swiped = useRef(false);
  const selectedSubject = subjects.find((subject) => subject.id === cat.linkedSubjectId);
  const savedSubject = cat.linkedSubjectId;

  function commitName() {
    const attempt = resolveInlineSave(name, blocked.current);
    if (!attempt.value) {
      if (!attempt.blocked) setName(cat.name);
      return;
    }
    if (attempt.value !== cat.name) actions.updateCategory(cat.id, { name: attempt.value });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    swiped.current = false;
    if (e.pointerType === "mouse") return;
    if ((e.target as Element).closest("input,textarea,select")) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setSwipe(
      resolveSwipe({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        axis: null,
        pointerDown: true,
      }),
    );
    setMoving(true);
  }

  function cancelSwipe() {
    start.current = null;
    axis.current = null;
    setMoving(false);
    setSwipe(REST);
  }

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    const from = start.current;
    if (!from) return;
    const next = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: axis.current,
      pointerDown: true,
    });
    if (next.axis === "y") {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      start.current = null;
      setMoving(false);
      setSwipe(REST);
      return;
    }
    if (next.axis === "x") {
      e.preventDefault();
      axis.current = next.axis;
      swiped.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setSwipe(next);
  }

  function endSwipe(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const from = start.current;
    const locked = axis.current;
    start.current = null;
    axis.current = null;
    setMoving(false);
    setSwipe(REST);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const resolved = resolveSwipe({
      pointerType: e.pointerType,
      startX: from.x,
      startY: from.y,
      x: e.clientX,
      y: e.clientY,
      axis: locked,
      pointerDown: false,
    });
    // Swiping left latches the two text actions open; a right swipe archives directly.
    if (resolved.action === "delete") setRevealed(true);
    else if (resolved.action === "archive") {
      setRevealed(false);
      onArchive();
    }
  }

  const offset = revealed ? -SWIPE_MAX_PX : swipe.dx;
  const underlay = Math.min(Math.abs(offset), SWIPE_MAX_PX);
  const visible = offset < 0;

  return (
    <div
      {...dragProps}
      data-row-swipe
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onClickCapture={onClickCapture}
      className={`relative touch-pan-y ${dragging ? "opacity-40" : ""}`}
    >
      {/* Swipe-left underlay: the two text actions, not coloured tiles. */}
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 z-0 flex items-center justify-end gap-1 overflow-hidden"
        style={{ width: visible ? underlay : 0 }}
      >
        <button
          onClick={() => {
            setRevealed(false);
            onArchive();
          }}
          aria-label={`Archive ${cat.name}`}
          className="min-h-11 shrink-0 px-2 text-[12px] text-muted"
        >
          Archive
        </button>
        <button
          onClick={() => {
            setRevealed(false);
            onDelete();
          }}
          aria-label={`Delete category: ${cat.name}`}
          className="min-h-11 shrink-0 px-2 text-[12px] text-rose"
        >
          Delete
        </button>
      </div>

      <div
        className="relative z-10 flex min-h-11 items-center border-b border-line"
        style={{ transform: `translateX(${offset}px)`, transition: moving ? "none" : "transform 180ms ease-out" }}
      >
        <button
          onClick={() => {
            if (revealed) {
              setRevealed(false);
              return;
            }
            onToggle();
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: catColor(cat.color) }}
          />
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{cat.name}</span>
          {cat.linkedSubjectId && (
            <span className="hidden shrink-0 text-[12px] text-faint sm:block">{cat.linkedSubjectId}</span>
          )}
        </button>
      </div>

      <Collapse open={expanded}>
        <div className="border-b border-line pb-3 pt-2">
          <div className="flex items-center gap-2 pb-3">
            <span aria-hidden className="cursor-grab touch-none px-1 text-[12px] text-faint active:cursor-grabbing">
              Drag
            </span>
            <button
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label="Move up"
              className="min-h-11 px-2 text-[12px] text-muted disabled:opacity-30"
            >
              Up
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label="Move down"
              className="min-h-11 px-2 text-[12px] text-muted disabled:opacity-30"
            >
              Down
            </button>
          </div>

          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => {
              blocked.current = false;
              setName(e.target.value);
            }}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                blocked.current = true;
                setName(cat.name);
                e.currentTarget.blur();
              }
            }}
            aria-label="Category name"
            className="mb-4 h-11 w-full border-b border-line bg-transparent text-[16px] outline-none"
          />

          <div className="mb-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Colour</div>
            <div className="flex flex-wrap gap-1">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => actions.updateCategory(cat.id, { color: c })}
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === cat.color}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  {/* A picker needs readable swatches; the chosen one gets a ring. */}
                  <span
                    aria-hidden
                    className={`h-5 w-5 rounded-full ${c === cat.color ? "ring-2 ring-ink ring-offset-2 ring-offset-canvas" : ""}`}
                    style={{ backgroundColor: catColor(c) }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Linked LearnHarness subject
            </label>
            <select
              value={savedSubject ?? ""}
              aria-label="Linked LearnHarness subject"
              onChange={(event) =>
                actions.updateCategory(cat.id, {
                  linkedSubjectId: event.target.value || null,
                  linkedTopicId: null,
                })
              }
              className="h-11 w-full border-b border-line bg-transparent text-[16px] outline-none"
            >
              <option value="">None</option>
              {savedSubject && !subjects.some((subject) => subject.id === savedSubject) && (
                <option value={savedSubject}>{savedSubject} (saved)</option>
              )}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>

            {(selectedSubject?.topics.length || cat.linkedTopicId) && (
              <select
                value={cat.linkedTopicId ?? ""}
                aria-label="LearnHarness topic"
                onChange={(event) =>
                  actions.updateCategory(cat.id, { linkedTopicId: event.target.value || null })
                }
                className="mt-2 h-11 w-full border-b border-line bg-transparent text-[16px] outline-none"
              >
                <option value="">No topic</option>
                {cat.linkedTopicId && !selectedSubject?.topics.some((topic) => topic.id === cat.linkedTopicId) && (
                  <option value={cat.linkedTopicId}>{cat.linkedTopicId} (saved)</option>
                )}
                {(selectedSubject?.topics ?? []).map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-4 pt-3">
            <button onClick={onArchive} className="min-h-11 text-[12px] text-muted">
              Archive
            </button>
            <button
              onClick={onDelete}
              aria-label={`Delete category: ${cat.name}`}
              className="min-h-11 text-[12px] text-rose"
            >
              Delete
            </button>
          </div>
        </div>
      </Collapse>
    </div>
  );
}

/** Confirmation sheet for a category deletion. Escape and the scrim cancel;
 *  role="dialog" keeps AppShell from also closing the Categories page. */
function DeleteCategoryDialog({
  cat,
  count,
  closing,
  onCancel,
  onConfirm,
}: {
  cat: Category;
  count: number;
  closing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const heading = count === 0 ? `Delete ${cat.name}?` : `Delete ${cat.name} and its ${count} ${count === 1 ? "task" : "tasks"}?`;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      <button
        aria-label="Cancel"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className={`panel-backdrop absolute inset-0 cursor-default bg-scrim ${closing ? "is-closing" : ""}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className={`panel-sheet relative w-full max-w-[420px] bg-canvas px-5 py-5 ${closing ? "is-closing" : ""}`}
      >
        <h2 className="text-[15px] font-semibold">{heading}</h2>
        <p className="mt-2 text-[12.5px] text-muted">This cannot be undone except with the Undo toast.</p>
        <div className="mt-5 flex justify-end gap-4">
          <Button autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CategoriesView() {
  const { data, actions } = useStore();
  const notify = useToast();
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [shownDelete, setShownDelete] = useState<DeleteTarget | null>(null);
  const [name, setName] = useState("");
  const addBlocked = useRef(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const hub = useSync();
  const subjects = useMemo(() => mirrorSubjects(hub.mirror), [hub.mirror]);

  const active = data.categories
    .filter((c) => !c.archived && !c.deletedAt)
    .sort((a, b) => a.order - b.order);
  const archived = data.categories.filter((c) => c.archived && !c.deletedAt);
  const activeRows = useListExit(active);
  const archivedRows = useListExit(archived);

  const deletePresence = usePresence(!!deleting, MOTION_MS.base);
  if (deleting && deleting !== shownDelete) setShownDelete(deleting);

  function add() {
    const attempt = resolveInlineSave(name, addBlocked.current);
    addBlocked.current = attempt.blocked;
    if (!attempt.value) return;
    const id = actions.addCategory(attempt.value);
    setName("");
    setExpanded(id);
  }

  function reorder(fromId: string, toIndex: number) {
    const ids = active.map((c) => c.id).filter((id) => id !== fromId);
    ids.splice(toIndex, 0, fromId);
    // Archived categories keep their relative slots after the active ones.
    actions.reorderCategories([...ids, ...archived.map((c) => c.id)]);
  }

  function archive(cat: Category) {
    actions.archiveCategory(cat.id);
    notify("Category archived", "success", {
      label: "Undo",
      run: () => {
        actions.archiveCategory(cat.id, false);
        notify("Archive undone");
      },
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.cat.id;
    setDeleting(null);
    actions.deleteCategory(id);
    notify("Category deleted", "success", {
      label: "Undo",
      run: () => {
        actions.undoDeleteCategory();
        notify("Delete undone");
      },
    });
  }

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      {!hub.configured && <p className="page-block mb-4 text-[12px] text-muted">Open LearnHarness on the laptop so it syncs.</p>}

      <div className="page-block mb-4 border-b border-line">
        <input
          value={name}
          onChange={(e) => {
            addBlocked.current = false;
            setName(e.target.value);
          }}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              addBlocked.current = true;
              setName("");
              e.currentTarget.blur();
            }
          }}
          placeholder="New category"
          aria-label="New category name"
          className="h-11 w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
      </div>

      {activeRows.length === 0 ? (
        <p className="page-block py-6 text-[13px] text-muted">No categories yet. Add one above to start sorting your days.</p>
      ) : (
        <div className="page-block">
          {activeRows.map(({ item: cat, exiting }, i) => (
            <div key={cat.id} className={`row-shell ${exiting ? "is-exiting" : ""}`}>
              <CategoryRow
                cat={cat}
                index={i}
                total={active.length}
                expanded={expanded === cat.id}
                onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
                dragging={dragId === cat.id}
                onMove={(dir) => reorder(cat.id, i + dir)}
                onDelete={() => setDeleting({ cat, count: countCategoryTasks(data, cat.id) })}
                onArchive={() => archive(cat)}
                subjects={subjects}
                dragProps={{
                  draggable: expanded === cat.id,
                  onDragStart: (e) => {
                    setDragId(cat.id);
                    e.dataTransfer.effectAllowed = "move";
                  },
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: (e) => {
                    e.preventDefault();
                    if (dragId && dragId !== cat.id) reorder(dragId, i);
                    setDragId(null);
                  },
                  onDragEnd: () => setDragId(null),
                }}
              />
            </div>
          ))}
        </div>
      )}

      {archivedRows.length > 0 && (
        <section className="page-block mt-8">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Archived</h3>
          {archivedRows.map(({ item: cat, exiting }) => (
            <div key={cat.id} className={`row-shell ${exiting ? "is-exiting" : ""}`}>
              <div className="flex min-h-11 items-center gap-2.5 border-b border-line">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full opacity-60"
                  style={{ backgroundColor: catColor(cat.color) }}
                />
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-muted">{cat.name}</span>
                <button
                  onClick={() => actions.archiveCategory(cat.id, false)}
                  className="ui-press min-h-11 px-2 text-[12px] text-muted"
                >
                  Restore
                </button>
                <button
                  onClick={() => setDeleting({ cat, count: countCategoryTasks(data, cat.id) })}
                  aria-label={`Delete category: ${cat.name}`}
                  className="ui-press min-h-11 px-2 text-[12px] text-rose"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {deletePresence.mounted && shownDelete && (
        <DeleteCategoryDialog
          cat={shownDelete.cat}
          count={shownDelete.count}
          closing={deletePresence.closing}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
