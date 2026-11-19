import { useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Bold,
  Check,
  FileText,
  ImagePlus,
  Italic,
  Send,
  Sigma,
  Trash2,
  X,
} from "lucide-react";
import type { Task } from "../domain/model";
import { useStore } from "../state/store";
import { Button, Chip, IconButton } from "./ui";

export function NotesEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, actions } = useStore();
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const note = task.note;
  const status = note?.handoff.status;
  const subjects = data.settings.learnharnessSubjects;

  function insert(snippet: string, caretOffset = snippet.length) {
    if (!note) return;
    const element = textareaRef.current;
    const start = element?.selectionStart ?? note.content.length;
    const end = element?.selectionEnd ?? note.content.length;
    const next = note.content.slice(0, start) + snippet + note.content.slice(end);
    actions.updateNote(task.id, next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + caretOffset, start + caretOffset);
    });
  }

  function attachImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      actions.addImage(task.id, { name: file.name, dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  const previewSource = (note?.content ?? "").replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, name: string) => `[${name}](#wikilink-${encodeURIComponent(name)})`,
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <FileText size={13} /> Task notes
            </div>
            <h2 className="truncate text-lg font-semibold text-white">{task.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {status === "ready" && <Chip tone="amber">ready for LearnHarness</Chip>}
              {status === "sent" && <Chip tone="emerald">sent</Chip>}
              {status === "failed" && <Chip tone="rose">handoff failed</Chip>}
              {subjects.length > 0 && (
                <select
                  value={task.linkedSubjectId ?? ""}
                  onChange={(event) =>
                    actions.linkSubject(task.id, event.target.value || null)
                  }
                  className="rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none"
                >
                  <option value="">Link to a LearnHarness subject…</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <IconButton onClick={onClose} title="Close notes" className="shrink-0">
            <X size={20} />
          </IconButton>
        </header>

        {!note ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400">
            <p className="text-sm">This task has no note yet.</p>
            <Button onClick={() => actions.ensureNote(task.id)}>Start a note</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-6 py-2">
              <Button
                variant="ghost"
                onClick={() => insert("**bold**", 2)}
                title="Bold"
                className="px-2 py-1"
              >
                <Bold size={15} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => insert("*italic*", 1)}
                title="Italic"
                className="px-2 py-1"
              >
                <Italic size={15} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => insert("\n## Heading\n", 9)}
                title="Heading"
                className="px-2 py-1 text-xs"
              >
                H2
              </Button>
              <Button
                variant="ghost"
                onClick={() => insert("$x^2$", 1)}
                title="Inline LaTeX"
                className="px-2 py-1"
              >
                <Sigma size={15} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => insert("\n$$\nE = mc^2\n$$\n", 5)}
                title="LaTeX block"
                className="px-2 py-1 text-xs"
              >
                $$ block
              </Button>
              <Button
                variant="ghost"
                onClick={() => insert("\n- [ ] subtask\n", 7)}
                title="Nested task"
                className="px-2 py-1 text-xs"
              >
                ☑ task
              </Button>
              <Button
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                title="Attach image"
                className="px-2 py-1"
              >
                <ImagePlus size={15} />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={attachImage}
              />

              <div className="ml-auto flex rounded-lg border border-white/10 p-0.5">
                {(["edit", "preview"] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      tab === value
                        ? "bg-white/10 text-slate-100"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {tab === "edit" ? (
                <textarea
                  ref={textareaRef}
                  value={note.content}
                  onChange={(event) => actions.updateNote(task.id, event.target.value)}
                  placeholder={"Write notes in Markdown…\n\n- [ ] nested tasks\n$x^2$ inline math, $$blocks$$\n[[wikilinks]] and pasted images"}
                  className="h-full min-h-80 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
                />
              ) : (
                <div className="md-preview min-h-80 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-relaxed text-slate-200">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {previewSource}
                  </ReactMarkdown>
                </div>
              )}

              {note.images.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Images</h3>
                  <div className="flex flex-wrap gap-3">
                    {note.images.map((image) => (
                      <div key={image.id} className="relative">
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="h-24 w-24 rounded-lg border border-white/10 object-cover"
                        />
                        <button
                          onClick={() => actions.removeImage(task.id, image.id)}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-1 text-slate-300 ring-1 ring-white/20 hover:text-rose-300"
                          title="Remove image"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
              <Button
                variant="outline"
                onClick={() => actions.markNoteDone(task.id)}
                disabled={task.done}
              >
                <Check size={16} /> {task.done ? "Task done" : "Mark done & prepare"}
              </Button>

              <div className="flex items-center gap-3">
                {status === "sent" && note.handoff.fileName && (
                  <span className="max-w-56 truncate text-[11px] text-slate-500">
                    {note.handoff.fileName}
                  </span>
                )}
                {status === "failed" && note.handoff.error && (
                  <span className="max-w-56 truncate text-[11px] text-rose-400">
                    {note.handoff.error}
                  </span>
                )}
                <Button
                  onClick={() => void actions.sendToLearnHarness(task.id)}
                  disabled={!task.linkedSubjectId || !note.content.trim()}
                  title={
                    task.linkedSubjectId
                      ? "Write this note to the LearnHarness handoff folder"
                      : "Link a LearnHarness subject first"
                  }
                >
                  <Send size={16} /> Send to LearnHarness
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
