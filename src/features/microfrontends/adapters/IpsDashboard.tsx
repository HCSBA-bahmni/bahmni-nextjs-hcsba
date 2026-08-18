import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { useMemo, useState } from "react";
import { generateIcvp, generateVhl, icvpArtifacts, ipsDocumentTitle, ipsDocumentTimestamp, loadIpsBinary, loadIpsBundle, resolveVhl, searchIpsDocuments, type FhirBundle, type IpsDocumentReference, type IpsResolvedFile } from "@/features/clinical/ips";
import { decodeIcvpPreview, icvpVaccinations, normalizeHc1, type IcvpPreview } from "@/features/clinical/icvp";
import { getRuntimeConfig } from "@/services/runtimeConfig";
import type { BahmniMfeProps } from "../types";
import { QrCameraScanner } from "./QrCameraScanner";

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];

function narrativeText(value: unknown): string {
  if (typeof value !== "string") return "";
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return new DOMParser().parseFromString(value, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function bundleResources(bundle: FhirBundle, type: string): Record<string, unknown>[] {
  return bundle.entry.flatMap((entry) => entry.resource?.resourceType === type ? [entry.resource] : []);
}

const normalizedSectionKey = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ipsSectionKey(section: Record<string, unknown>): string {
  const coding = asRecords(asRecord(section.code).coding)[0] ?? {};
  const text = normalizedSectionKey([section.title, coding.display, coding.code].filter(Boolean).join(" "));
  if (/vacun|immuniz|vaccine/.test(text)) return "vacunas";
  if (/alerg|allerg/.test(text)) return "alergias";
  if (/medic|medication/.test(text)) return "medicamentos";
  if (/diagn|problem|condition/.test(text)) return "diagnosticos";
  if (/proced/.test(text)) return "procedimientos";
  return text;
}

export function selectIpsSections(sections: Record<string, unknown>[], showSections: Record<string, unknown>): Record<string, unknown>[] {
  const configuredKeys = Object.keys(showSections);
  return sections.filter((section) => !configuredKeys.length || showSections[ipsSectionKey(section)] === true);
}

function BundlePreview({ bundle, showSections, maxItemsPerSection }: { bundle: FhirBundle; showSections: Record<string, unknown>; maxItemsPerSection?: number }) {
  const composition = bundleResources(bundle, "Composition")[0] ?? {};
  const patient = bundleResources(bundle, "Patient")[0] ?? {};
  const patientName = asRecords(patient.name)[0] ?? {};
  const givenNames = Array.isArray(patientName.given) ? patientName.given : [];
  const patientDisplay = patientName.text ?? ([...givenNames, patientName.family].filter(Boolean).join(" ") || patient.id || "—");
  const sections = selectIpsSections(asRecords(composition.section), showSections);
  return <div className="ips-bundle-preview"><dl className="clinical-details">
    <div><dt>Documento</dt><dd>{String(composition.title ?? asRecords(asRecord(composition.type).coding)[0]?.display ?? bundle.id ?? "IPS")}</dd></div>
    <div><dt>Fecha</dt><dd>{String(bundle.timestamp ?? composition.date ?? "—")}</dd></div>
    <div><dt>Paciente</dt><dd>{String(patientDisplay)}</dd></div>
    <div><dt>Identificador</dt><dd>{String(asRecords(patient.identifier)[0]?.value ?? "—")}</dd></div>
  </dl>{sections.map((section, index) => {
    const entries = asRecords(section.entry);
    const visibleEntries = maxItemsPerSection && maxItemsPerSection > 0 ? entries.slice(0, maxItemsPerSection) : entries;
    const narrative = narrativeText(asRecord(section.text).div);
    return <section key={String(section.title ?? index)}><h3>{String(section.title ?? asRecords(asRecord(section.code).coding)[0]?.display ?? `Sección ${index + 1}`)}</h3>{visibleEntries.length ? <><ul>{visibleEntries.map((reference, itemIndex) => <li key={itemIndex}>{String(reference.display ?? reference.reference ?? "Recurso clínico")}</li>)}</ul>{visibleEntries.length < entries.length && <p className="muted-text">Se muestran {visibleEntries.length} de {entries.length} registros.</p>}</> : narrative ? <p>{narrative}</p> : <p className="muted-text">Sin registros.</p>}</section>;
  })}</div>;
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a"); link.href = dataUrl; link.download = fileName; link.click();
}

const documentAttachment = (document: IpsDocumentReference) => document.content.find((content) => Boolean(content.attachment.url))?.attachment;

const previewField = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).join(", ") || "—" : value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

function LocalIcvpPreview({ preview }: { preview: IcvpPreview }) {
  const vaccinations = icvpVaccinations(preview);
  return <section className="icvp-local-preview" aria-label="Vista previa ICVP sin verificar firma">
    <h3>Certificado de vacunación (ICVP)</h3>
    <p className="warning-banner"><strong>Vista previa local</strong><br />El contenido se decodificó, pero la firma no fue verificada.</p>
    {!preview.hcert ? <p className="muted-text">El QR es HC1, pero no contiene un certificado ICVP interpretable.</p> : <>
      <dl className="clinical-details">
        <div><dt>Nombre</dt><dd>{previewField(preview.hcert.n)}</dd></div>
        <div><dt>Nombres</dt><dd>{previewField(preview.hcert.gn)}</dd></div>
        <div><dt>Fecha de nacimiento</dt><dd>{previewField(preview.hcert.dob)}</dd></div>
        <div><dt>Sexo</dt><dd>{previewField(preview.hcert.s)}</dd></div>
        <div><dt>Nacionalidad</dt><dd>{previewField(preview.hcert.ntl)}</dd></div>
        <div><dt>Documento</dt><dd>{[previewField(preview.hcert.ndt), previewField(preview.hcert.nid)].filter((value) => value !== "—").join(" · ") || "—"}</dd></div>
      </dl>
      <h4>Vacunas</h4>
      {!vaccinations.length ? <p className="muted-text">Sin registros de vacunación.</p> : <div className="icvp-vaccinations">{vaccinations.map((vaccination, index) => <dl className="clinical-details" key={index}>
        <div><dt>Producto</dt><dd>{previewField(vaccination.vp)}</dd></div>
        <div><dt>Fecha</dt><dd>{previewField(vaccination.dt)}</dd></div>
        <div><dt>Lote / identificador</dt><dd>{previewField(vaccination.bo)}</dd></div>
        <div><dt>País</dt><dd>{previewField(vaccination.cn)}</dd></div>
        <div><dt>Emisor</dt><dd>{previewField(vaccination.is)}</dd></div>
        <div><dt>Vigencia</dt><dd>{[previewField(vaccination.vls), previewField(vaccination.vle)].filter((value) => value !== "—").join(" — ") || "—"}</dd></div>
      </dl>)}</div>}
    </>}
  </section>;
}

export function IpsDashboard({ hostData, hostApi, tx }: BahmniMfeProps) {
  const isIcvp = hostData.section.type === "ipsIcvpReact";
  const sectionConfig = hostData.section.config;
  const showSections = asRecord(sectionConfig.showSections);
  const maxItemsPerSection = typeof sectionConfig.maxItemsPerSection === "number" ? sectionConfig.maxItemsPerSection : undefined;
  const allowGeneration = sectionConfig.allowGeneration !== false;
  const allowResolve = sectionConfig.allowResolve !== false;
  const allowShare = sectionConfig.allowShare !== false;
  const [viewerBundle, setViewerBundle] = useState<FhirBundle>();
  const [readerOpen, setReaderOpen] = useState(false);
  const [hc1Input, setHc1Input] = useState("");
  const [resolvedFiles, setResolvedFiles] = useState<IpsResolvedFile[]>([]);
  const [share, setShare] = useState<{ hc1: string; qr: string }>();
  const [icvpResults, setIcvpResults] = useState<Array<{ id: string; hc1?: string; pngDataUrl?: string }>>([]);
  const runtime = useQuery({ queryKey: ["runtime-config"], queryFn: getRuntimeConfig, staleTime: 60_000 });
  const integration = runtime.data?.integrations.ips;
  const configured = Boolean(integration?.enabled && integration.regionalBase);
  const normalizedHc1 = normalizeHc1(hc1Input);
  const localIcvp = useMemo(() => {
    if (!isIcvp || !/^HC1:/i.test(normalizedHc1)) return undefined;
    try { return { preview: decodeIcvpPreview(normalizedHc1) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "No fue posible decodificar el QR." }; }
  }, [isIcvp, normalizedHc1]);
  const documents = useQuery({ queryKey: ["clinical", "ips", hostData.section.type, hostData.patient.identifier, integration?.regionalBase], enabled: configured && Boolean(hostData.patient.identifier), queryFn: () => searchIpsDocuments(integration!.regionalBase, hostData.patient.identifier) });

  const openDocument = useMutation({
    mutationFn: async (document: IpsDocumentReference) => {
      const attachment = documentAttachment(document);
      if (!attachment?.url) throw new Error("El documento no tiene adjunto");
      if (attachment.contentType?.toLowerCase().includes("pdf")) {
        const blob = await loadIpsBinary(integration!.regionalBase, attachment.url);
        const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return undefined;
      }
      return loadIpsBundle(integration!.regionalBase, attachment.url);
    },
    onSuccess: async (bundle) => { if (bundle) { setViewerBundle(bundle); setShare(undefined); setIcvpResults([]); await hostApi.audit("VIEW_IPS_DOCUMENT", bundle.id ?? hostData.section.type); } },
  });
  const openResolved = useMutation({ mutationFn: (file: IpsResolvedFile) => loadIpsBundle(integration!.regionalBase, file.location), onSuccess: async (bundle) => { setReaderOpen(false); setViewerBundle(bundle); setShare(undefined); setIcvpResults([]); await hostApi.audit("RESOLVE_VHL", bundle.id ?? hostData.section.type); } });
  const resolveManifest = useMutation({ mutationFn: (hc1: string) => resolveVhl(integration!.vhlResolvePath, hc1), onSuccess: setResolvedFiles });
  const shareVhl = useMutation({ mutationFn: async () => { const hc1 = await generateVhl(integration!.vhlGeneratePath, viewerBundle!); if (!hc1) throw new Error("El mediador no devolvió HC1"); return { hc1, qr: await QRCode.toDataURL(hc1, { errorCorrectionLevel: "M", margin: 1, scale: 6 }) }; }, onSuccess: async (result) => { setShare(result); await hostApi.audit("GENERATE_VHL", viewerBundle?.id ?? "IPS"); } });
  const createIcvp = useMutation({ mutationFn: () => generateIcvp(integration!.icvpFromBundlePath, viewerBundle!), onSuccess: async (results) => { setIcvpResults(results.map((result, index) => ({ id: result.immunizationId ?? String(index + 1), ...icvpArtifacts(result) }))); await hostApi.audit("GENERATE_ICVP", viewerBundle?.id ?? "ICVP"); } });

  if (runtime.isLoading) return <p role="status">Cargando integración IPS…</p>;
  if (runtime.isError) return <p role="alert" className="error-banner">No fue posible cargar la configuración pública de IPS.</p>;
  if (!integration || !configured) return <div className="warning-banner"><strong>Integración IPS protegida</strong><p>Configure un mediador same-origin sin credenciales en el navegador para habilitar esta sección.</p></div>;
  const mutationError = openDocument.error ?? openResolved.error ?? resolveManifest.error ?? shareVhl.error ?? createIcvp.error;

  return <div className="ips-dashboard">
    {mutationError && <p role="alert" className="error-banner">{mutationError instanceof Error ? mutationError.message : "La operación IPS no pudo completarse."}</p>}
    {allowResolve && <div className="dashboard-inline-actions"><Button outlined icon="pi pi-qrcode" label={tx("READ_VHL_DOCUMENT", "Leer QR / HC1")} disabled={!integration.vhlResolvePath} onClick={() => { setReaderOpen(true); setResolvedFiles([]); }} /></div>}
    {documents.isLoading && <p role="status">Consultando documentos…</p>}
    {documents.isError && <div role="alert" className="error-banner">No fue posible consultar documentos IPS. <Button text label="Reintentar" onClick={() => void documents.refetch()} /></div>}
    {!documents.isLoading && !documents.isError && !documents.data?.length && <p className="muted-text">No hay documentos registrados para este paciente.</p>}
    {Boolean(documents.data?.length) && <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Documento</th><th>Fecha</th><th>Autor</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{documents.data?.map((document, index) => <tr key={document.id ?? index}><td>{ipsDocumentTitle(document)}</td><td>{ipsDocumentTimestamp(document) ? new Intl.DateTimeFormat(hostData.locale, { dateStyle: "medium", timeStyle: "short" }).format(ipsDocumentTimestamp(document)) : "—"}</td><td>{document.author?.map((author) => author.display).filter(Boolean).join(", ") || "—"}</td><td>{document.status ?? "—"}</td><td><Button text icon="pi pi-eye" label="Ver" loading={openDocument.isPending && openDocument.variables === document} onClick={() => openDocument.mutate(document)} /></td></tr>)}</tbody></table></div>}

    <Dialog visible={readerOpen} modal header={tx("READ_VHL_DOCUMENT", "Leer QR / HC1")} className="ips-reader-dialog" onHide={() => setReaderOpen(false)}>
      <label htmlFor={`hc1-${hostData.section.type}`}>Contenido HC1</label>
      <InputTextarea id={`hc1-${hostData.section.type}`} rows={6} autoResize value={hc1Input} onBlur={() => setHc1Input(normalizeHc1(hc1Input))} onChange={(event) => { setHc1Input(event.target.value); setResolvedFiles([]); }} placeholder="HC1:…" />
      <QrCameraScanner onScan={(value) => { setHc1Input(normalizeHc1(value)); setResolvedFiles([]); }} />
      {localIcvp?.preview && <LocalIcvpPreview preview={localIcvp.preview} />}
      {localIcvp?.error && <p className="muted-text">El contenido no se pudo interpretar localmente como ICVP. Todavía puede corresponder a un VHL resoluble.</p>}
      {allowResolve && <Button icon="pi pi-search" label="Resolver VHL" loading={resolveManifest.isPending} disabled={!/^HC1:/i.test(normalizedHc1)} onClick={() => { setHc1Input(normalizedHc1); resolveManifest.mutate(normalizedHc1); }} />}
      {resolveManifest.isSuccess && !resolvedFiles.length && <p className="muted-text">El manifiesto no contiene archivos.</p>}
      <ul className="ips-resolved-files">{resolvedFiles.map((file, index) => <li key={`${file.location}-${index}`}><span>{file.contentType ?? "Documento FHIR"}</span><Button text label="Abrir" loading={openResolved.isPending && openResolved.variables === file} onClick={() => openResolved.mutate(file)} /></li>)}</ul>
    </Dialog>

    <Dialog visible={Boolean(viewerBundle)} maximizable modal header={isIcvp ? "Documento ICVP" : "Documento IPS"} className="clinical-expanded-dialog" onHide={() => setViewerBundle(undefined)}>
      {viewerBundle && <><div className="dashboard-inline-actions">{isIcvp ? allowGeneration && <Button icon="pi pi-qrcode" label="Generar ICVP" loading={createIcvp.isPending} disabled={!integration.icvpFromBundlePath} onClick={() => createIcvp.mutate()} /> : allowGeneration && allowShare && <Button icon="pi pi-share-alt" label="Compartir VHL" loading={shareVhl.isPending} disabled={!integration.vhlGeneratePath} onClick={() => shareVhl.mutate()} />}</div><BundlePreview bundle={viewerBundle} showSections={showSections} maxItemsPerSection={maxItemsPerSection} /></>}
      {share && <section className="ips-share-result"><h3>VHL generado</h3><Image unoptimized src={share.qr} alt="Código QR VHL" width={192} height={192} /><code>{share.hc1}</code><div className="dashboard-inline-actions"><Button outlined label="Copiar HC1" onClick={() => navigator.clipboard.writeText(share.hc1)} /><Button outlined label="Descargar QR" onClick={() => downloadDataUrl(share.qr, `VHL_${hostData.patient.identifier}.png`)} /></div></section>}
      {icvpResults.map((result) => <section className="ips-share-result" key={result.id}><h3>Inmunización {result.id}</h3>{result.pngDataUrl && <Image unoptimized src={result.pngDataUrl} alt={`Código QR ICVP ${result.id}`} width={192} height={192} />}{result.hc1 && <code>{result.hc1}</code>}<div className="dashboard-inline-actions">{result.hc1 && <Button outlined label="Copiar HC1" onClick={() => navigator.clipboard.writeText(result.hc1!)} />}{result.pngDataUrl && <Button outlined label="Descargar QR" onClick={() => downloadDataUrl(result.pngDataUrl!, `ICVP_${result.id}.png`)} />}</div></section>)}
    </Dialog>
  </div>;
}
