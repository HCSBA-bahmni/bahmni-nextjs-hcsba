import { Button } from "primereact/button";
import { useEffect, useRef, useState } from "react";
import { getPabellonProtocolPDF, PabellonPDFError } from "@/services/bahmni/pabellonProtocolPDF";
import type { PabellonProtocolVersion } from "@/services/bahmni/pabellonProtocols";
import { PabellonPDFCanvas } from "./PabellonPDFCanvas";
export function PabellonProtocolPDF({ patientUuid, surgeryId, version }: { patientUuid: string; surgeryId: string; version: PabellonProtocolVersion }) {
  const [url, setUrl] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const busy = useRef(false); const alive = useRef(true); const request = useRef<AbortController | null>(null); const currentURL = useRef<string | null>(null); const generation = useRef(0);
  const release = () => { if (currentURL.current) URL.revokeObjectURL(currentURL.current); currentURL.current = null; };
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); release(); }; }, []);
  const preview = async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null); release(); setUrl(null); setPdfBlob(null);
    const controller = new AbortController(); request.current = controller; const token = ++generation.current;
    try {
      const blob = await getPabellonProtocolPDF(patientUuid, surgeryId, version.snapshotId, version.sourceDataSHA256, controller.signal);
      if (!alive.current || token !== generation.current || controller.signal.aborted) return;
      const value = URL.createObjectURL(blob); currentURL.current = value; setUrl(value); setPdfBlob(blob);
    } catch (failure) {
      if (alive.current && token === generation.current && !controller.signal.aborted) setError(failure instanceof PabellonPDFError ? failure.message : "No fue posible obtener el PDF.");
    } finally { if (alive.current && token === generation.current) { busy.current = false; setLoading(false); request.current = null; } }
  };
  return <section aria-label="PDF de la versión seleccionada">
    <div className="dashboard-inline-actions"><Button label={url ? "Volver a consultar PDF" : "Vista previa PDF"} icon="pi pi-file-pdf" loading={loading} disabled={loading} onClick={() => { void preview(); }} />
      {url && <a className="p-button p-component p-button-outlined" href={url} download={`protocolo-snapshot-${version.snapshotId}-v${version.version}.pdf`}>Descargar PDF</a>}
    </div>
    {loading && <p role="status">Consultando y verificando PDF…</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {url && pdfBlob && <><p className="warning-banner">Copia generada desde la snapshot de esta versión. El cierre no acredita firma digital.</p><div aria-label={`Vista previa PDF versión ${version.version}`}><PabellonPDFCanvas key={url} blob={pdfBlob} /></div></>}
  </section>;
}
