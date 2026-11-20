import { catColor } from "../theme/store";
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { CATEGORY_COLORS, DEFAULT_HARNESS_URL, type Category } from "../domain/model";
import { HarnessClient, type HarnessSubject } from "../lib/harness";
import { useStore } from "../state/store";
import { CATEGORY_ICONS, CategoryIcon } from "./icons";

function CategoryRow({
  cat,
  index,
  total,
  expanded,
  onToggle,
  dragProps,
  dragging,
  onMove,
  subjects,
  unreachable,
}: {
  cat: Category;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  dragProps: React.HTMLAttributes<HTMLDivElement>;
  dragging: boolean;
  onMove: (dir: -1 | 1) => void;
  subjects: HarnessSubject[];
  unreachable: boolean;
}) {
  const { actions } = useStore();
  const [name, setName] = useState(cat.name);
  const selectedSubject = subjects.find((subject) => subject.id === cat.linkedSubjectId);
  const savedSubject = cat.linkedSubjectId;
  return (
    <div
      {...dragProps}
      className={`overflow-hidden rounded-2xl bg-surface transition-opacity ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex min-h-[56px] items-center gap-2 pl-2 pr-2">
        <span className="cursor-grab touch-none p-2 text-faint active:cursor-grabbing" aria-hidden>
          <GripVertical size={18} />
        </span>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${catColor(cat.color)}26` }}
          >
            <CategoryIcon name={cat.icon} size={17} color={catColor(cat.color)} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold" style={{ color: catColor(cat.color) }}>
            {cat.name}
          </span>
          {cat.linkedSubjectId && (
            <span className="hidden shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted sm:block">
              {cat.linkedSubjectId}
            </span>
          )}
        </button>
        <div className="flex flex-col">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="p-0.5 text-faint hover:text-ink disabled:opacity-20"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="p-0.5 text-faint hover:text-ink disabled:opacity-20"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="animate-row space-y-4 border-t border-line px-4 py-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const clean = name.trim();
              if (!clean) setName(cat.name);
              else if (clean !== cat.name) actions.updateCategory(cat.id, { name: clean });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Category name"
            className="w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[16px] outline-none focus:bg-surface-3"
          />

          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">Colour</div>
            <div className="flex flex-wrap gap-2.5">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => actions.updateCategory(cat.id, { color: c })}
                  aria-label={`Colour ${c}`}
                  aria-pressed={catColor(cat.color) === c}
                  className="h-8 w-8 rounded-full transition-transform active:scale-90"
                  style={{
                    background: catColor(c),
                    boxShadow: catColor(cat.color) === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${catColor(c)}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">Icon</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(CATEGORY_ICONS).map((key) => (
                <button
                  key={key}
                  onClick={() => actions.updateCategory(cat.id, { icon: key })}
                  aria-label={`Icon ${key}`}
                  aria-pressed={cat.icon === key}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    cat.icon === key ? "bg-ink/15" : "bg-surface-2 hover:bg-surface-3"
                  }`}
                >
                  <CategoryIcon name={key} size={18} color={cat.icon === key ? catColor(cat.color) : "var(--text-faint)"} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">
              Linked LearnHarness subject
            </div>
            {unreachable && (
              <p className="mb-2 text-[12px] text-rose" role="status">
                LearnHarness not reachable
              </p>
            )}
            <select
              value={savedSubject ?? ""}
              disabled={unreachable}
              aria-label="Linked LearnHarness subject"
              onChange={(event) =>
                actions.updateCategory(cat.id, {
                  linkedSubjectId: event.target.value || null,
                  linkedTopicId: null,
                })
              }
              className="w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[16px] outline-none focus:bg-surface-3 disabled:text-muted"
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
                disabled={unreachable}
                aria-label="LearnHarness topic"
                onChange={(event) =>
                  actions.updateCategory(cat.id, { linkedTopicId: event.target.value || null })
                }
                className="mt-2 w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[15px] outline-none focus:bg-surface-3 disabled:text-muted"
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

          <button
            onClick={() => actions.archiveCategory(cat.id)}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 text-[14px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-95"
          >
            <Archive size={16} /> Archive
          </button>
        </div>
      )}
    </div>
  );
}

export function CategoriesView() {
  const { data, actions } = useStore();
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<HarnessSubject[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const harnessUrl = data.settings.harnessUrl || DEFAULT_HARNESS_URL;

  useEffect(() => {
    let alive = true;
    setUnreachable(false);
    void new HarnessClient(harnessUrl).subjects().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setSubjects(result.data.subjects);
        setUnreachable(false);
      } else {
        // Saved links are left untouched; only the picker loses its options.
        setSubjects([]);
        setUnreachable(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [harnessUrl]);

  const active = data.categories.filter((c) => !c.archived).sort((a, b) => a.order - b.order);
  const archived = data.categories.filter((c) => c.archived);

  function add() {
    if (!name.trim()) return;
    const id = actions.addCategory(name);
    setName("");
    setExpanded(id);
  }

  function reorder(fromId: string, toIndex: number) {
    const ids = active.map((c) => c.id).filter((id) => id !== fromId);
    ids.splice(toIndex, 0, fromId);
    // Archived categories keep their relative slots after the active ones.
    actions.reorderCategories([...ids, ...archived.map((c) => c.id)]);
  }

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      <p className="mb-4 px-1 text-[14px] leading-relaxed text-muted">
        Categories group each day&apos;s tasks. Drag to reorder, tap one to change its colour, icon or linked subject.
      </p>
      {unreachable && (
        <p className="mb-4 px-1 text-[13px] text-rose" role="status">
          LearnHarness not reachable
        </p>
      )}

      <div className="mb-4 flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-5 pr-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New category"
          aria-label="New category name"
          className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-faint"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          aria-label="Add category"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition-all active:scale-90 disabled:bg-surface-3 disabled:text-faint"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-10 text-center text-[14px] text-muted">
          No categories yet. Add one above to start sorting your days.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((cat, i) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              index={i}
              total={active.length}
              expanded={expanded === cat.id}
              onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
              dragging={dragId === cat.id}
              onMove={(dir) => reorder(cat.id, i + dir)}
              subjects={subjects}
              unreachable={unreachable}
              dragProps={{
                draggable: true,
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
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">Archived</h3>
          <div className="space-y-2">
            {archived.map((cat) => (
              <div key={cat.id} className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-surface px-4">
                <span className="h-3 w-3 rounded-full opacity-60" style={{ background: catColor(cat.color) }} />
                <span className="min-w-0 flex-1 truncate text-[16px] text-muted">{cat.name}</span>
                <button
                  onClick={() => actions.archiveCategory(cat.id, false)}
                  className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-[13px] font-semibold hover:bg-surface-3"
                >
                  <ArchiveRestore size={15} /> Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
