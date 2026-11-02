import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useState } from "react";
import { ClinicalBlock, ClinicalField } from "./PabellonClinicalBlock";
import styles from "./PabellonProtocols.module.css";
import { PabellonProtocolPDF } from "./PabellonProtocolPDF";
import { getPabellonProtocols, PabellonProtocolError, type PabellonProtocolVersion } from "@/services/bahmni/pabellonProtocols";

const dateLabel = (value: { rawValue: string } | null) => value ? `${value.rawValue} (zona horaria no resuelta)` : "—";
const label = (value: { display: string | null; code: string } | null) => value?.display || value?.code || "—";
export interface PabellonProtocolsDialogProps { actorUuid: string; patientUuid: string; surgeryId: string; onHide(): void; }
function ProtocolDetail({ version }: { version: PabellonProtocolVersion }) {
  const data = version.clinical; const name = data.patientAtRegistration;
  return <section aria-label="Detalle de versión del protocolo" className={styles.detail}>
    <ClinicalBlock title="Identificación y versión" icon="pi-id-card">
      <h3 className={styles.patient}>{[name?.givenNames, name?.familyName, name?.secondFamilyName].filter(Boolean).join(" ") || "Nombre no disponible en esta snapshot"}</h3>
      <p className={styles.version}>Versión {version.version} · {version.amendment ? "Enmienda" : "Original"} · Cerrada</p>
      <dl className={styles.grid}><ClinicalField title="Cierre de esta versión">{dateLabel(version.closedAt)}</ClinicalField><ClinicalField title="Captura de la snapshot">{dateLabel(version.capturedAt)}</ClinicalField></dl>
      <p className="warning-banner">Protocolo cerrado. El cierre no acredita una firma digital.</p>
    </ClinicalBlock>
    <ClinicalBlock title="Datos de la intervención" icon="pi-heart">
      <dl className={styles.grid}><ClinicalField title="Cirujano">{data.surgeon}</ClinicalField><ClinicalField title="Lateralidad">{data.laterality}</ClinicalField></dl>
      <dl className={styles.fields}><ClinicalField title="Diagnóstico postoperatorio">{data.diagnosis}</ClinicalField><ClinicalField title="Prestaciones realizadas">{data.procedures.map(label).join(" · ")}</ClinicalField><ClinicalField title="Intervención adicional">{data.additionalProcedure}</ClinicalField></dl>
    </ClinicalBlock>
    <ClinicalBlock title="Detalle operatorio" icon="pi-file-edit"><p className={styles.narrative}>{data.surgicalDetail || "—"}</p></ClinicalBlock>
    <ClinicalBlock title="Equipo de la intervención" icon="pi-users">{data.team.length ? <ul className={styles.team}>{data.team.map((member, index) => <li key={`${index}:${member.role?.sourceId ?? "unknown"}`}><strong>{member.name || "—"}</strong><span>{label(member.role)}</span></li>)}</ul> : <p>Sin equipo consignado en esta snapshot.</p>}</ClinicalBlock>
    <ClinicalBlock title="Observaciones" icon="pi-comment"><p className={styles.narrative}>{data.observations || "—"}</p></ClinicalBlock>
  </section>;
}
export function PabellonProtocolsDialog({ actorUuid, patientUuid, surgeryId, onHide }: PabellonProtocolsDialogProps) {
  const contextKey = `${actorUuid}:${patientUuid}:${surgeryId}`;
  const [selection, setSelection] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["pabellon-protocols-qa", actorUuid, patientUuid, surgeryId], queryFn: ({ signal }) => getPabellonProtocols(patientUuid, surgeryId, signal), enabled: Boolean(actorUuid && patientUuid && surgeryId), retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const chosen = query.data?.families.flatMap((family) => family.versions).find((version) => selection === `${contextKey}:${version.snapshotId}`);
  const retry = () => { setSelection(null); void query.refetch({ cancelRefetch: false }); };
  return <Dialog header="Protocolos operatorios" visible modal blockScroll maximizable style={{ width: "76vw", maxWidth: "1100px" }} breakpoints={{ "960px": "95vw" }} onHide={onHide}>
    {query.isPending ? <p role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando protocolos…</p> : query.isError ? <div role="alert" className="error-banner"><p>{query.error instanceof PabellonProtocolError ? query.error.message : "No fue posible consultar los protocolos."}</p><Button label="Reintentar" icon="pi pi-refresh" loading={query.isFetching} disabled={query.isFetching} onClick={retry} /></div> : <>
      <p className="warning-banner">QA: datos sintéticos. Solo se muestran versiones cerradas desde su propia snapshot.</p>
      <Button label="Actualizar protocolos" icon="pi pi-refresh" loading={query.isFetching} disabled={query.isFetching} onClick={retry} />
      {chosen ? <><Button text label="Volver al historial de versiones" icon="pi pi-arrow-left" onClick={() => setSelection(null)} /><ProtocolDetail version={chosen} /><ClinicalBlock title="Documento de Pabellón" icon="pi-file-pdf"><PabellonProtocolPDF key={`${contextKey}:${chosen.snapshotId}:${chosen.sourceDataSHA256}`} patientUuid={patientUuid} surgeryId={surgeryId} version={chosen} /></ClinicalBlock></> : query.data?.families.map((family) => <ClinicalBlock key={family.family} title={family.family === "surgeon" ? "Protocolos del cirujano" : "Protocolos del responsable"} icon="pi-folder-open">
        {family.withheldVersions > 0 && <p role="note">{family.withheldVersions} versión(es) no publicada(s). Las enmiendas sin cierre propio requieren revisión clínica.</p>}
        {family.status === "ambiguous" || family.status === "invalid" ? <p role="alert">Esta familia requiere revisión. No se publican sus versiones.</p> : family.versions.length === 0 ? <p>Sin versiones publicables para esta familia.</p> : <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Versión</th><th>Tipo</th><th>Cierre propio</th><th>Acción</th></tr></thead><tbody>{family.versions.map((version) => <tr key={version.snapshotId}><td>{version.version}{version.version === family.latestPublishedVersion ? " · Última publicada" : ""}</td><td>{version.amendment ? "Enmienda" : "Original"}</td><td>{dateLabel(version.closedAt)}</td><td><Button text label="Ver versión" icon="pi pi-eye" disabled={query.isFetching} onClick={() => setSelection(`${contextKey}:${version.snapshotId}`)} /></td></tr>)}</tbody></table></div>}
      </ClinicalBlock>)}
    </>}
  </Dialog>;
}
