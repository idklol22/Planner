import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { HMaterialRow, HSubjectRow } from "../storage/hub";
import { useSync } from "../state/sync";
import { sortMaterials } from "../sync/mirror-view";
import { nearestCategoryColor } from "../domain/palette";
import { PdfViewer } from "./PdfViewer";
import { Panel } from "./ui";

function MaterialRowButton({ material, onOpen }: { material: HMaterialRow; onOpen: () => void }) {
  const meta = [
    material.lecture && `Lecture ${material.lecture}`,
    material.date,
    material.pageCount > 0 && `${material.pageCount} pages`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Panel className="!p-0">
      <button
        onClick={onOpen}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-ink/[0.05]"
      >
        <FileText size={18} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{material.title || material.fileName}</span>
          <span className="block truncate text-[11.5px] text-muted">{meta || material.fileName}</span>
        </span>
        <ChevronRight size={16} className="text-faint" />
      </button>
    </Panel>
  );
}

function MaterialReader({ material }: { material: HMaterialRow }) {
  const { client } = useSync();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    setBlob(null);
    setText(null);
    setError(null);
    client
      .getFile(material.sha256)
      .then(async (file) => {
        if (!alive) return;
        if (material.kind === "text") setText(await file.text());
        else setBlob(file);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not download this file");
      });
    return () => {
      alive = false;
    };
  }, [client, material.sha256, material.kind]);

  if (error)
    return (
      <p className="px-1 text-[13px] text-rose" role="status">
        {error}
      </p>
    );
  if (material.kind === "text") {
    return text === null ? (
      <p className="px-1 text-[13px] text-muted">Loading…</p>
    ) : (
      <pre className="glass-panel whitespace-pre-wrap p-4 text-[13px]">{text}</pre>
    );
  }
  if (!blob) return <p className="px-1 text-[13px] text-muted">Downloading…</p>;
  return <PdfViewer blob={blob} fileName={material.fileName} />;
}

/** Subjects, then files (from the synced Harness mirror), then an in-app reader. */
export function LibraryView({ onTitle }: { onTitle?: (title: string | null) => void }) {
  const { mirror, configured } = useSync();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [material, setMaterial] = useState<HMaterialRow | null>(null);

  const subjects = useMemo(
    () => [...mirror.subjects].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [mirror.subjects],
  );
  const subject: HSubjectRow | undefined = subjects.find((s) => s.id === subjectId);
  const files = useMemo(
    () => sortMaterials(mirror.materials.filter((m) => m.subjectId === subjectId)),
    [mirror.materials, subjectId],
  );

  useEffect(() => {
    onTitle?.(material ? material.title || material.fileName : (subject?.name ?? null));
  }, [onTitle, material, subject]);

  if (!configured) {
    return (
      <p className="px-4 text-[13px] leading-relaxed text-muted">
        Connect the hub in Settings, under Cloud sync, to browse your LearnHarness files here.
      </p>
    );
  }

  const back = (
    <button
      onClick={() => (material ? setMaterial(null) : setSubjectId(null))}
      className="mb-3 flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink"
    >
      <ChevronLeft size={16} /> {material ? (subject?.name ?? "Back") : "All subjects"}
    </button>
  );

  if (material) {
    return (
      <div className="px-4 pb-8 md:px-6">
        {back}
        <MaterialReader material={material} />
      </div>
    );
  }

  if (subject) {
    return (
      <div className="px-4 pb-8 md:px-6">
        {back}
        {files.length === 0 ? (
          <p className="text-[13px] text-muted">No files for this subject yet.</p>
        ) : (
          <div className="space-y-2">
            {files.map((m) => (
              <MaterialRowButton key={m.id} material={m} onOpen={() => setMaterial(m)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 md:px-6">
      {subjects.length === 0 ? (
        <p className="text-[13px] text-muted">
          No subjects yet. They appear after the laptop agent has mirrored LearnHarness to the hub.
        </p>
      ) : (
        <div className="space-y-2">
          {subjects.map((s) => {
            const count = mirror.materials.filter((m) => m.subjectId === s.id).length;
            return (
              <Panel key={s.id} className="!p-0">
                <button
                  onClick={() => setSubjectId(s.id)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-ink/[0.05]"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: nearestCategoryColor(s.color) }}
                  />
                  <span className="flex-1 text-[16px] font-medium">{s.name}</span>
                  <span className="text-[12px] text-muted">
                    {count} {count === 1 ? "file" : "files"}
                  </span>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
