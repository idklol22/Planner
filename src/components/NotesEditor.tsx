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
  Link2,
  Send,
  Sigma,
  Trash2,
  X,
} from "lucide-react";
import type { Task } from "../domain/model";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { Button, Chip, IconButton, Segmented } from "./ui";

export function NotesEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, actions } = useStore();
  const notify = useToast();
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const note = task.note;
  const status = note?.handoff.status;
  const subjects = data.settings.learnharnessSubjects;
  const words = note?.content.trim() ? note.content.trim().split(/\s+/).length : 0;

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
      notify("Image attached to note", "info");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function send() {
    setSending(true);
    const result = await actions.sendToLearnHarness(task.id);
    setSending(false);
    notify(
      result.ok ? `Handoff written · ${result.message}` : result.message,
      result.ok ? "success" : "error",
    );
  }

  const previewSource = (note?.content ?? "").replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, name: string) => `[${name}](#wikilink-${encodeURIComponent(name)})`,
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="animate-slide relative flex h-full w-full max-w-3xl flex-col border-l border-line-2 bg-surface shadow-2xl shadow-black/70">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />

        <header className="border-b border-line px-7 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                <FileText size={12} /> Task notes
              </div>
              <h2 className="truncate text-xl font-semibold tracking-tight text-ink">
                {task.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {status === "ready" && <Chip tone="amber">ready for LearnHarness</Chip>}
                {status === "sent" && <Chip tone="mint">sent</Chip>}
                {status === "failed" && <Chip tone="rose">handoff failed</Chip>}
                {note && <Chip tone="slate">{words} words</Chip>}
              </div>
            </div>
            <IconButton onClick={onClose} title="Close notes" className="h-9 w-9">
              <X size={19} />
            </IconButton>
          </div>

          {subjects.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <Link2 size={13} className="text-faint" />
              <select
                value={task.linkedSubjectId ?? ""}
                onChange={(event) => actions.linkSubject(task.id, event.target.value || null)}
                className="inset-field flex-1 bg-black/25 px-3 py-2 text-xs text-muted focus:outline-none"
              >
                <option value="">Link to a LearnHarness subject…</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        {!note ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white/[0.03] text-accent">
              <FileText size={24} />
            </div>
            <p className="text-sm text-muted">This task has no note yet.</p>
            <Button variant="primary" onClick={() => actions.ensureNote(task.id)}>
              Start writing
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1 border-b border-line bg-black/10 px-7 py-2.5">
              <IconButton onClick={() => insert("**bold**", 2)} title="Bold" className="h-7 w-7">
                <Bold size={14} />
              </IconButton>
              <IconButton onClick={() => insert("*italic*", 1)} title="Italic" className="h-7 w-7">
                <Italic size={14} />
              </IconButton>
              <button
                onClick={() => insert("\n## Heading\n", 9)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-white/[0.06] hover:text-ink"
              >
                H2
              </button>
              <div className="mx-1 h-4 w-px bg-line-2" />
              <IconButton
                onClick={() => insert("$x^2$", 1)}
                title="Inline LaTeX"
                className="h-7 w-7"
              >
                <Sigma size={14} />
              </IconButton>
              <button
                onClick={() => insert("\n$$\nE = mc^2\n$$\n", 5)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-white/[0.06] hover:text-ink"
              >
                $$ block
              </button>
              <button
                onClick={() => insert("\n- [ ] subtask\n", 7)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-white/[0.06] hover:text-ink"
              >
                ☑ task
              </button>
              <IconButton
                onClick={() => fileRef.current?.click()}
                title="Attach image"
                className="h-7 w-7"
              >
                <ImagePlus size={14} />
              </IconButton>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={attachImage}
              />

              <div className="ml-auto">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "edit", label: "Write" },
                    { value: "preview", label: "Preview" },
                  ]}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
              {tab === "edit" ? (
                <textarea
                  ref={textareaRef}
                  value={note.content}
                  onChange={(event) => actions.updateNote(task.id, event.target.value)}
                  placeholder={
                    "Write notes in Markdown…\n\n- [ ] nested tasks\n$x^2$ inline math, $$blocks$$\n[[wikilinks]] and pasted images"
                  }
                  className="h-full min-h-[24rem] w-full resize-none rounded-xl border border-line bg-black/25 p-5 font-mono text-[13px] leading-7 text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/45"
                />
              ) : (
                <div className="md-preview min-h-[24rem] rounded-xl border border-line bg-black/25 p-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {previewSource}
                  </ReactMarkdown>
                </div>
              )}

              {note.images.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Attached images
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {note.images.map((image) => (
                      <div key={image.id} className="group relative">
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="h-24 w-24 rounded-xl border border-line object-cover"
                        />
                        <button
                          onClick={() => actions.removeImage(task.id, image.id)}
                          className="absolute -right-1.5 -top-1.5 rounded-full border border-line-2 bg-surface-2 p-1.5 text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100 hover:text-rose"
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

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-black/10 px-7 py-4">
              <Button
                variant="secondary"
                onClick={() => actions.markNoteDone(task.id)}
                disabled={task.done}
              >
                <Check size={16} /> {task.done ? "Task done" : "Mark done & prepare"}
              </Button>

              <div className="flex items-center gap-3">
                {status === "sent" && note.handoff.fileName && (
                  <span className="hidden max-w-52 truncate text-[10px] text-faint sm:block">
                    {note.handoff.fileName}
                  </span>
                )}
                {status === "failed" && note.handoff.error && (
                  <span className="max-w-52 truncate text-[10px] text-rose">
                    {note.handoff.error}
                  </span>
                )}
                <Button
                  variant="primary"
                  onClick={() => void send()}
                  disabled={sending || !task.linkedSubjectId || !note.content.trim()}
                  title={
                    task.linkedSubjectId
                      ? "Write this note to the LearnHarness handoff folder"
                      : "Link a LearnHarness subject first"
                  }
                >
                  <Send size={15} /> {sending ? "Sending…" : "Send to LearnHarness"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
