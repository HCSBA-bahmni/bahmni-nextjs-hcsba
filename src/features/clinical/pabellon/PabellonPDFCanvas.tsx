import { Button } from "primereact/button";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Local bitmap-only viewer for an already verified Blob; no external PDF URL. */
export function PabellonPDFCanvas({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1); const [busy, setBusy] = useState(true); const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false; let loading: PDFDocumentLoadingTask | undefined;
    void (async () => {
      const pdf = await import("pdfjs-dist");
      if (stopped) return;
      pdf.GlobalWorkerOptions.workerSrc = "/bahmni/vendor/pdfjs/6.4.299/pdf.worker.min.mjs";
      const data = new Uint8Array(await blob.arrayBuffer());
      if (stopped) return;
      loading = pdf.getDocument({ data, useWorkerFetch: false, useWasm: false, useSystemFonts: false, stopAtErrors: true });
      const value = await loading.promise;
      if (stopped) return;
      if (value.numPages < 1 || value.numPages > 200) throw new Error("PDF_PAGE_LIMIT");
      setDocument(value);
    })().catch(() => { if (!stopped) { setError(true); setBusy(false); } });
    return () => { stopped = true; void loading?.destroy(); };
  }, [blob]);
  useEffect(() => {
    if (!document) return;
    let stopped = false; let rendering: RenderTask | undefined;
    void (async () => {
      const value = await document.getPage(page);
      if (stopped || !canvas.current) return;
      const target = canvas.current; const context = target.getContext("2d");
      if (!context) throw new Error("PDF_CANVAS_UNAVAILABLE");
      const original = value.getViewport({ scale: 1 });
      const width = Math.min(900, Math.max(280, target.parentElement?.clientWidth || 760));
      const viewport = value.getViewport({ scale: width / original.width });
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      target.width = Math.ceil(viewport.width * ratio); target.height = Math.ceil(viewport.height * ratio);
      target.style.width = `${viewport.width}px`; target.style.height = "auto";
      rendering = value.render({ canvas: target, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0], annotationMode: 0 });
      await rendering.promise;
      if (!stopped) setBusy(false);
    })().catch(() => { if (!stopped) { setError(true); setBusy(false); } });
    return () => { stopped = true; rendering?.cancel(); };
  }, [document, page]);
  const move = (next: number) => { setBusy(true); setPage(next); };
  return <section aria-label="Vista previa del PDF verificado">
    <div className="dashboard-inline-actions">
      <Button text icon="pi pi-chevron-left" label="Página anterior" disabled={busy || error || page <= 1} onClick={() => move(page - 1)} />
      <span aria-live="polite">Página {page} de {document?.numPages ?? "…"}</span>
      <Button text icon="pi pi-chevron-right" label="Página siguiente" disabled={busy || error || !document || page >= document.numPages} onClick={() => move(page + 1)} />
    </div>
    {busy && <p role="status">Dibujando página del PDF…</p>}
    {error ? <p role="alert" className="error-banner">No fue posible dibujar la vista previa. Puede descargar el PDF verificado o volver a consultarlo.</p> : <div className="dashboard-matrix-scroll" style={{ maxHeight: "65vh", background: "#eef0f2", padding: "8px" }}>
      <canvas ref={canvas} role="img" aria-label={`Página ${page} del PDF del protocolo`} style={{ visibility: busy ? "hidden" : "visible", maxWidth: "100%", height: "auto", background: "white" }} />
    </div>}
  </section>;
}
