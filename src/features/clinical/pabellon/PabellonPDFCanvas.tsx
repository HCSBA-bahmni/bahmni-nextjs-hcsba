import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import styles from "./PabellonProtocols.module.css";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Local bitmap-only viewer for an already verified Blob; no external PDF URL. */
export function PabellonPDFCanvas({ blob, documentKind = "protocolo" }: { blob: Blob; documentKind?: "protocolo" | "solicitud" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 752, height: 592 });
  const [view, setView] = useState<{ mode: "page" | "width" | "custom"; scale: number }>({ mode: "page", scale: 1 });
  const [actualScale, setActualScale] = useState(1);
  const [expanded, setExpanded] = useState(true);
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
    if (!expanded || !document) return;
    const measure = () => {
      if (!container.current) return;
      const next = { width: Math.max(120, (container.current.clientWidth || 776) - 24), height: Math.max(120, (container.current.clientHeight || 616) - 24) };
      setSize(old => old.width === next.width && old.height === next.height ? old : next);
    };
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [expanded, document]);
  useEffect(() => {
    if (!document || !expanded) return;
    let stopped = false; let rendering: RenderTask | undefined;
    void (async () => {
      const value = await document.getPage(page);
      if (stopped || !canvas.current) return;
      const target = canvas.current; const context = target.getContext("2d");
      if (!context) throw new Error("PDF_CANVAS_UNAVAILABLE");
      const original = value.getViewport({ scale: 1 });
      const scale = view.mode === "page" ? Math.min(size.width / original.width, size.height / original.height) : view.mode === "width" ? size.width / original.width : view.scale;
      const viewport = value.getViewport({ scale });
      // Bound bitmap memory independently from visible zoom dimensions.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 4096 / viewport.width, 4096 / viewport.height, Math.sqrt(12000000 / (viewport.width * viewport.height)));
      target.width = Math.ceil(viewport.width * ratio); target.height = Math.ceil(viewport.height * ratio);
      target.style.width = `${viewport.width}px`; target.style.height = `${viewport.height}px`;
      rendering = value.render({ canvas: target, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0], annotationMode: 0 });
      await rendering.promise;
      if (!stopped) { setActualScale(scale); setBusy(false); }
    })().catch(() => { if (!stopped) { setError(true); setBusy(false); } });
    return () => { stopped = true; rendering?.cancel(); };
  }, [document, page, expanded, size, view]);
  const move = (next: number) => { setBusy(true); setPage(next); };
  const zoom = (direction: number) => { setBusy(true); setView({ mode: "custom", scale: Math.max(.25, Math.min(3, Math.round((actualScale + direction * .25) * 100) / 100)) }); };
  const fit = (mode: "page" | "width") => { setBusy(true); setView({ mode, scale: 1 }); container.current?.scrollTo?.({ top: 0, left: 0 }); };
  return <><Button text icon="pi pi-window-maximize" label="Abrir visor PDF" onClick={() => setExpanded(true)} /><Dialog draggable={false} visible={expanded} onHide={() => setExpanded(false)} modal blockScroll maximizable header="Vista previa PDF" className={styles.dialog} style={{ width: "96vw", height: "94dvh", maxHeight: "94dvh" }} contentStyle={{ display: "flex", flexDirection: "column", overflow: "hidden", padding: "0.5rem 1rem" }}><section aria-label="Vista previa del PDF verificado" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
    <div className="dashboard-inline-actions" style={{ flexWrap: "wrap", flexShrink: 0, gap: ".4rem", paddingBottom: ".4rem" }}>
      <Button text icon="pi pi-chevron-left" label="Página anterior" disabled={busy || error || page <= 1} onClick={() => move(page - 1)} />
      <span aria-live="polite">Página {page} de {document?.numPages ?? "…"}</span>
      <Button text icon="pi pi-chevron-right" label="Página siguiente" disabled={busy || error || !document || page >= document.numPages} onClick={() => move(page + 1)} />
      <Button text icon="pi pi-search-minus" aria-label="Alejar PDF" tooltip="Alejar" disabled={busy || error || actualScale <= .25} onClick={() => zoom(-1)} />
      <span aria-label="Zoom del PDF" aria-live="polite" style={{ minWidth: "3.5rem", textAlign: "center" }}>{Math.round(actualScale * 100)} %</span>
      <Button text icon="pi pi-search-plus" aria-label="Acercar PDF" tooltip="Acercar" disabled={busy || error || actualScale >= 3} onClick={() => zoom(1)} />
      <Button text label="100 %" disabled={busy || error} onClick={() => { setBusy(true); setView({ mode: "custom", scale: 1 }); }} />
      <Button text icon="pi pi-arrows-h" label="Ajustar al ancho" aria-pressed={view.mode === "width"} disabled={busy || error} onClick={() => fit("width")} />
      <Button text icon="pi pi-window-maximize" label="Página completa" aria-pressed={view.mode === "page"} disabled={busy || error} onClick={() => fit("page")} />
    </div>
    {busy && <p role="status">Dibujando página del PDF…</p>}
    {error ? <p role="alert" className="error-banner">No fue posible dibujar la vista previa. Puede descargar el PDF verificado o volver a consultarlo.</p> : <div ref={container} style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#eef0f2", padding: "8px" }}>
      <canvas ref={canvas} role="img" aria-label={`Página ${page} del PDF ${documentKind === "solicitud" ? "de la solicitud" : "del protocolo"}`} style={{ visibility: busy ? "hidden" : "visible", display: "block", marginInline: "auto", maxWidth: "none", background: "white" }} />
    </div>}
  </section></Dialog></>;
}
