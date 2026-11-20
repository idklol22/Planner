import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

/** In-app pdf.js viewer for a PDF Blob fetched from the hub (with the bearer token). */
export function PdfViewer({ blob, fileName }: { blob: Blob; fileName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setError(null);
    setPage(1);
    void blob
      .arrayBuffer()
      .then((data) => pdfjs.getDocument({ data }).promise)
      .then((pdf) => {
        loaded = pdf;
        if (alive) setDoc(pdf);
        else void pdf.destroy();
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not open this PDF");
      });
    return () => {
      alive = false;
      if (loaded) void loaded.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc.getPage(page).then((pdfPage) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: zoom * 1.4 * ratio });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      task = pdfPage.render({ canvasContext: context, viewport });
      task.promise.catch(() => {
        // Cancelled by a newer render.
      });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  const total = doc?.numPages ?? 0;
  const go = (next: number) => setPage(Math.min(Math.max(1, next), Math.max(1, total)));
  const zoomBy = (factor: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 transition-colors hover:bg-surface-3 active:scale-90 disabled:opacity-40";

  return (
    <div>
      <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-surface px-3 py-2">
        <button className={btn} aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft size={18} />
        </button>
        <label className="flex items-center gap-1 text-[14px] text-muted">
          <input
            aria-label="Page number"
            type="number"
            min={1}
            max={Math.max(1, total)}
            value={page}
            onChange={(e) => go(Number(e.target.value) || 1)}
            className="w-14 rounded-lg bg-surface-2 px-2 py-1 text-center text-ink"
          />
          / {total || "…"}
        </label>
        <button className={btn} aria-label="Next page" disabled={page >= total} onClick={() => go(page + 1)}>
          <ChevronRight size={18} />
        </button>
        <span className="flex-1" />
        <button className={btn} aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut size={18} />
        </button>
        <span className="w-12 text-center text-[13px] text-muted">{Math.round(zoom * 100)}%</span>
        <button className={btn} aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={18} />
        </button>
        {blobUrl && (
          <a className={btn} href={blobUrl} download={fileName} aria-label="Download PDF">
            <Download size={18} />
          </a>
        )}
      </div>
      {error ? (
        <p className="px-1 text-[14px] text-rose" role="status">
          {error}
        </p>
      ) : (
        <div className="overflow-auto rounded-2xl bg-surface-2 p-2 text-center">
          {!doc && <p className="py-10 text-[14px] text-muted">Opening…</p>}
          <canvas ref={canvasRef} className="mx-auto max-w-none bg-white" />
        </div>
      )}
    </div>
  );
}
