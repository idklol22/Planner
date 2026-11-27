import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Mic, Paperclip, Send, X } from "lucide-react";
import { harnessStatus } from "../lib/harness-link";
import {
  groupByDay,
  MAX_IMAGE_SIDE,
  needsDownscale,
  pickAudioMime,
  validateOutgoing,
} from "../lib/message-ui";
import {
  CURSOR_KEY,
  harnessLink,
  messageStatus,
  OUTBOX_KEY,
  sha256Hex,
  THREADS_KEY,
  type ThreadMessage,
} from "../lib/messages";
import { useMessages } from "../state/messages";
import { useSync } from "../state/sync";
import { useToast } from "../state/toast";
import { mirrorSubjects } from "../sync/mirror-view";
import { Button, Chip, IconButton, Panel } from "./ui";

interface PreparedFile {
  name: string;
  mime: string;
  blob: Blob;
  sha256: string;
  url: string;
  kind: "image" | "audio";
  durationSec?: number;
}

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clockTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date): string {
  const now = new Date();
  if (dayKey(date) === dayKey(now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Status tags come from the same helper the message client uses to build rows. */
function statusText(row: ThreadMessage): string {
  const status = messageStatus(row, row.status === "queued");
  if (status === "queued") return "Queued";
  if (status === "sent") return "Sent";
  return "Delivered";
}

function durationText(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Message thread with text, images and voice memos, carried only by the hub. */
export function ChatView() {
  const sync = useSync();
  const notify = useToast();
  const messages = useMessages();
  const subjects = useMemo(() => mirrorSubjects(sync.mirror), [sync.mirror]);
  const [subjectId, setSubjectId] = useState("");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [voiceDraft, setVoiceDraft] = useState<PreparedFile | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const urlCache = useRef(new Map<string, string>());
  const pendingUrls = useRef(new Set<string>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Object URLs are cached by content hash so the same attachment is fetched once.
  async function prepareBlob(
    blob: Blob,
    name: string,
    durationSec?: number,
  ): Promise<PreparedFile> {
    const buffer = await blob.arrayBuffer();
    const sha256 = await sha256Hex(buffer);
    let url = urlCache.current.get(sha256);
    if (!url) {
      url = URL.createObjectURL(blob);
      urlCache.current.set(sha256, url);
    }
    return {
      name,
      mime: blob.type || "application/octet-stream",
      blob,
      sha256,
      url,
      kind: blob.type.startsWith("image/") ? "image" : "audio",
      ...(durationSec === undefined ? {} : { durationSec }),
    };
  }

  // The chat page owns the read marker: after its first pull and on the way out.
  useEffect(() => {
    messages.setActive(true);
    let alive = true;
    void messages.refresh().finally(() => {
      if (alive) messages.markOpened();
    });
    return () => {
      alive = false;
      messages.markOpened();
      messages.setActive(false);
    };
    // Provider callbacks live as long as the provider itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A second tab changing the hub clears the message keys on this one too.
  useEffect(() => {
    const keys = new Set([THREADS_KEY, OUTBOX_KEY, CURSOR_KEY]);
    const onStorage = (event: StorageEvent) => {
      if (event.key && keys.has(event.key)) void messages.refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [messages.refresh]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.thread.length]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [draft]);

  useEffect(() => {
    const client = sync.client;
    if (!client) return;
    let alive = true;
    for (const attachment of messages.thread.flatMap((row) => row.attachments)) {
      const mime = attachment.mime;
      if (!mime.startsWith("image/") && !mime.startsWith("audio/")) continue;
      if (urlCache.current.has(attachment.sha256) || pendingUrls.current.has(attachment.sha256)) continue;
      pendingUrls.current.add(attachment.sha256);
      void client
        .getFile(attachment.sha256)
        .then((blob) => {
          if (!alive) return;
          const url = URL.createObjectURL(blob);
          urlCache.current.set(attachment.sha256, url);
          setUrls((current) => ({ ...current, [attachment.sha256]: url }));
        })
        .catch(() => {
          // A missing attachment is shown as a placeholder, never breaks the thread.
        })
        .finally(() => {
          pendingUrls.current.delete(attachment.sha256);
        });
    }
    return () => {
      alive = false;
    };
  }, [messages.thread, sync.client]);

  // Cache is keyed by content hash and belongs to one hub only.
  useEffect(() => {
    for (const url of urlCache.current.values()) URL.revokeObjectURL(url);
    urlCache.current.clear();
    setUrls({});
    setFiles([]);
    setVoiceDraft(null);
  }, [sync.client]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      for (const url of urlCache.current.values()) URL.revokeObjectURL(url);
      urlCache.current.clear();
    },
    [],
  );

  function clearDraft() {
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
    setDraft("");
    setFiles([]);
    setVoiceDraft(null);
    setInlineError(null);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function prepareImage(file: File): Promise<PreparedFile> {
    if (!file.type.startsWith("image/")) return prepareBlob(file, file.name);
    const preview = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not read image"));
        image.src = preview;
      });
      if (!needsDownscale({
        width: image.naturalWidth,
        height: image.naturalHeight,
        bytes: file.size,
      })) {
        return prepareBlob(file, file.name);
      }
      const scale = Math.min(
        1,
        MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return prepareBlob(file, file.name);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (!jpeg) return prepareBlob(file, file.name);
      const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
      return prepareBlob(new Blob([jpeg], { type: "image/jpeg" }), name);
    } finally {
      URL.revokeObjectURL(preview);
    }
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const prepared: PreparedFile[] = [];
    for (const file of selected) {
      try {
        prepared.push(await prepareImage(file));
      } catch {
        notify(`Could not attach ${file.name}`, "error");
      }
    }
    if (prepared.length) setFiles((current) => [...current, ...prepared]);
  }

  async function submitMessage(textValue: string, extra: PreparedFile[]) {
    if (sending) return;
    const all = [...files, ...(voiceDraft ? [voiceDraft] : []), ...extra];
    const text = textValue.trim();
    const check = validateOutgoing({
      text: textValue,
      attachments: all.map((file) => ({ mime: file.mime, bytes: file.blob.size })),
    });
    if (!check.ok) {
      setInlineError(check.error);
      return;
    }
    setInlineError(null);
    setSending(true);
    try {
      await messages.send({
        text,
        subjectId: subjectId || null,
        files: all.map((file) => ({
          name: file.name,
          mime: file.mime,
          bytes: file.blob,
          ...(file.durationSec === undefined ? {} : { durationSec: file.durationSec }),
        })),
      });
      setDraft("");
      setFiles([]);
      setVoiceDraft(null);
    } catch (cause) {
      // Keep every draft byte so a retry can never send twice.
      setInlineError(`Could not send: ${failureText(cause)}`);
    } finally {
      setSending(false);
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitMessage(draft, []);
    }
  }

  async function startRecording() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      clearDraft();
      notify("Microphone is unavailable on this device", "error");
      return;
    }
    const mime = pickAudioMime((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) {
      clearDraft();
      notify("Voice recording is not supported on this device", "error");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      setElapsed(0);
      setRecording(true);
      recorder.start();
      timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch {
      for (const track of stream?.getTracks() ?? []) track.stop();
      clearDraft();
      notify("Microphone access was denied", "error");
    }
  }

  async function finishRecording(sendIt: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || sending) return;
    const duration = elapsed;
    let blob: Blob | null = null;
    try {
      blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        recorder.stop();
      });
    } catch {
      blob = null;
    } finally {
      for (const track of recorder.stream.getTracks()) track.stop();
      recorderRef.current = null;
      setRecording(false);
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    if (!blob || blob.size === 0) {
      if (sendIt) notify("No audio was recorded", "error");
      return;
    }
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    try {
      const prepared = await prepareBlob(blob, `voice-${Date.now()}.${extension}`, duration);
      if (sendIt) await submitMessage(draft, [prepared]);
      else setVoiceDraft(prepared);
    } catch {
      notify("Could not prepare the voice memo", "error");
    }
  }

  const linkText = harnessStatus(messages.configured, harnessLink(sync.mirror.subjects));
  const selectedSubject = subjects.find((subject) => subject.id === subjectId)?.name ?? null;
  const groups = groupByDay(messages.thread, dayLabel);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height:
          "calc(100dvh - 72px - var(--safe-top) - max(16px, var(--safe-bottom)))",
      }}
    >
      <Panel className="!mb-3 !shrink-0 !p-3">
        <p className="text-[13px] text-muted">{linkText}</p>
      </Panel>

      {!messages.configured ? null : (
        <>
          <div className="mb-2 shrink-0">
            <Chip tone="accent">{selectedSubject ?? "No subject"}</Chip>
          </div>
          <select
            aria-label="Subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="mb-3 w-full shrink-0 rounded-xl border border-line-2 bg-[var(--surface)] px-3 py-2 text-[16px] text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>

          {messages.error && (
            <div
              role="alert"
              className="mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-rose/25 bg-rose/10 px-3 py-2 text-[13px] text-rose"
            >
              <span className="min-w-0 flex-1">{messages.error}</span>
              <Button className="!min-h-8 !px-2 !text-[12px]" onClick={() => void messages.refresh()}>
                Retry
              </Button>
            </div>
          )}

          <div
            ref={threadRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            {messages.loading && messages.thread.length === 0 ? (
              <div className="space-y-2" aria-label="Loading messages">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
                  >
                    <div className="h-10 w-40 animate-pulse rounded-2xl bg-surface-2" />
                  </div>
                ))}
              </div>
            ) : !messages.error && messages.thread.length === 0 ? (
              <div className="px-4 py-10 text-center text-[14px] text-muted">
                No messages yet. Say hello to your laptop.
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="flex items-center gap-3 py-3">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((row) => {
                      const mine = row.sender === "planner";
                      return (
                        <div key={row.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                          <div
                            className={`max-w-[82%] rounded-2xl p-3 text-[14px] leading-relaxed ${
                              mine
                                ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                            }`}
                          >
                            {row.text && <p className="whitespace-pre-wrap break-words">{row.text}</p>}
                            {row.attachments.length > 0 && (
                              <div className={`flex flex-wrap gap-2 ${row.text ? "mt-2" : ""}`}>
                                {row.attachments.map((attachment) => {
                                  const url = urls[attachment.sha256];
                                  if (attachment.mime.startsWith("image/")) {
                                    return (
                                      <button
                                        key={attachment.sha256}
                                        type="button"
                                        onClick={() => url && setViewer(url)}
                                        aria-label={`Open ${attachment.name}`}
                                        className="h-16 w-16 overflow-hidden rounded-[10px] border border-[var(--border)] transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent"
                                      >
                                        {url ? (
                                          <img
                                            src={url}
                                            alt={attachment.name}
                                            className="h-16 w-16 object-cover"
                                          />
                                        ) : (
                                          <span className="block h-16 w-16 animate-pulse bg-ink/10" />
                                        )}
                                      </button>
                                    );
                                  }
                                  if (attachment.mime.startsWith("audio/")) {
                                    return (
                                      <audio
                                        key={attachment.sha256}
                                        controls
                                        src={url}
                                        className="min-h-10 w-full"
                                        aria-label={attachment.name}
                                      />
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            )}
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 text-[11px] ${mine ? "justify-end" : ""}`}
                          >
                            <time dateTime={row.createdAt} className="text-faint">
                              {clockTime(row.createdAt)}
                            </time>
                            {mine && <span className="text-muted">{statusText(row)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--border)] bg-[var(--bg)] pb-[max(8px,var(--safe-bottom))] pt-2">
            {inlineError && (
              <p role="alert" className="mb-2 text-[13px] text-rose">
                {inlineError}
              </p>
            )}
            {(files.length > 0 || voiceDraft) && (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <Chip key={`${file.sha256}-${index}`}>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove ${file.name}`}
                      className="flex items-center gap-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {file.name}
                      <X size={12} />
                    </button>
                  </Chip>
                ))}
                {voiceDraft && (
                  <Chip tone="accent">
                    <button
                      type="button"
                      onClick={() => setVoiceDraft(null)}
                      aria-label="Remove voice memo"
                      className="flex items-center gap-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Voice memo
                      <X size={12} />
                    </button>
                  </Chip>
                )}
              </div>
            )}

            {recording ? (
              <div className="flex items-center gap-2">
                <span className="flex h-10 items-center gap-2 rounded-xl bg-rose/10 px-3 text-[14px] font-semibold tabular-nums text-rose">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose" />
                  {durationText(elapsed)}
                </span>
                <span className="flex-1" />
                <Button className="!min-h-10" onClick={() => void finishRecording(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="!min-h-10"
                  onClick={() => void finishRecording(true)}
                >
                  Send
                </Button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  aria-label="Message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKey}
                  placeholder="Message your laptop…"
                  className="max-h-[120px] min-h-10 flex-1 resize-none rounded-xl border border-line-2 bg-[var(--surface)] px-3 py-2 text-[16px] leading-snug text-ink placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent"
                />
                <IconButton
                  className="!h-10 !w-10 !rounded-xl hover:bg-ink/[0.07]"
                  aria-label="Attach image or audio"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={18} />
                </IconButton>
                <IconButton
                  className="!h-10 !w-10 !rounded-xl hover:bg-ink/[0.07]"
                  aria-label="Record voice memo"
                  onClick={() => void startRecording()}
                >
                  <Mic size={18} />
                </IconButton>
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={sending || !messages.ready}
                  onClick={() => void submitMessage(draft, [])}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast)" }}
                >
                  <Send size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void onFiles(event)}
                />
              </div>
            )}
          </div>

          {viewer && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
              onClick={() => setViewer(null)}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--scrim)] p-4"
            >
              <button
                type="button"
                aria-label="Close image viewer"
                onClick={() => setViewer(null)}
                className="absolute right-4 top-[calc(16px+var(--safe-top))] flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={20} />
              </button>
              <img
                src={viewer}
                alt="Attachment"
                onClick={(event) => event.stopPropagation()}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
