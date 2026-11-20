import { Button } from "primereact/button";
import { useEffect, useRef, useState } from "react";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { renderRequestPDF } from "./requestPdfFromSnapshot";
import { PabellonPDFCanvas } from "./PabellonPDFCanvas";
export function PabellonRequestPDF({ item }: { item: PabellonItem }) {
  const [blob, setBlob] = useState<Blob | null>(null); const [url, setURL] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); const mounted = useRef(false); const controller = useRef<AbortController | null>(null); const currentURL = useRef<string | null>(null);
  const release = () => { if (currentURL.current) URL.revokeObjectURL(currentURL.current); currentURL.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); release(); }; }, []);
  const preview = async () => {
    if (busy.current) return; busy.current = true; setLoading(true); setError(null); release(); setURL(null); setBlob(null); const request = new AbortController(); controller.current = request;
    try { const result = await renderRequestPDF(item, request.signal); if (mounted.current && !request.signal.aborted) { const value = URL.createObjectURL(result); currentURL.current = value; setBlob(result); setURL(value); } }
    catch (failure) { if (mounted.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : "No fue posible generar el PDF de solicitud."); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  };
  return <section aria-label="PDF de solicitud">
    <div className="dashboard-inline-actions"><Button label="Vista previa PDF de solicitud" icon="pi pi-file-pdf" loading={loading} disabled={loading || !item.request?.sections?.length || !item.request.catalogueSelections} onClick={() => { void preview(); }} />{url && <a className="p-button p-component p-button-outlined" href={url} download={`solicitud-${item.request?.requestNumber ?? item.id}-v${item.requestSnapshot.version}.pdf`}>Descargar PDF</a>}</div>
    {loading && <p role="status">Preparando PDF con la plantilla original de Pabellón…</p>}{error && <p role="alert">{error}</p>}
    {blob && url && <PabellonPDFCanvas key={url} blob={blob} documentKind="solicitud" />}
  </section>;
}
