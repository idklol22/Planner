import { useMemo, useState } from "react";
import { NotebookText, Search } from "lucide-react";
import { fromISODate } from "../domain/dates";
import { useStore } from "../state/store";

export function NotesView({
  onOpenTask,
  openTaskId,
}: {
  onOpenTask: (id: string) => void;
  openTaskId: string | null;
}) {
  const { data } = useStore();
  const [query, setQuery] = useState("");

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.tasks
      .filter((t) => !t.deletedAt && t.note && (t.note.content.trim() || t.note.images.length))
      .filter(
        (t) => !q || t.title.toLowerCase().includes(q) || t.note!.content.toLowerCase().includes(q),
      )
      .sort((a, b) => b.note!.updatedAt.localeCompare(a.note!.updatedAt));
  }, [data.tasks, query]);

  const total = data.tasks.filter((t) => !t.deletedAt && t.note?.content.trim()).length;

  return (
    <div className="px-4 pb-8 pt-2 md:px-6">
      <label className="mb-4 flex items-center gap-3 rounded-full bg-surface-2 px-4 focus-within:bg-surface-3">
        <Search size={17} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-faint"
        />
      </label>

      {notes.length === 0 ? (
        <div className="animate-fade rounded-3xl border border-dashed border-white/15 px-5 py-12 text-center">
          <NotebookText size={30} className="mx-auto mb-3 text-faint" />
          <h2 className="text-[17px] font-semibold">{total === 0 ? "No notes yet" : "No matches"}</h2>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-[14px] leading-relaxed text-muted">
            {total === 0
              ? "Open any task and write a note. Math, images and checklists all work."
              : "Try a different word."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((task) => {
            const cat = data.categories.find((c) => c.id === task.categoryId);
            const snippet = task.note!.content.replace(/[#*_`>$\-[\]]/g, "").replace(/\s+/g, " ").trim();
            return (
              <button
                key={task.id}
                onClick={() => onOpenTask(task.id)}
                className={`animate-row block w-full rounded-2xl p-4 text-left transition-colors ${
                  openTaskId === task.id ? "bg-surface-3" : "bg-surface hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-2 text-[12px] font-medium text-faint">
                  {cat && (
                    <span className="flex items-center gap-1.5 font-semibold" style={{ color: cat.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                      {cat.name}
                    </span>
                  )}
                  <span>
                    {fromISODate(task.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="mt-1 truncate text-[17px] font-semibold">{task.title}</div>
                {snippet && (
                  <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted">{snippet}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
