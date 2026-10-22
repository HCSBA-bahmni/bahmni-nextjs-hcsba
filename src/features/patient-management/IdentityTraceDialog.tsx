import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { getIdentityCase, type IdentityCase } from "@/services/mpi/localIdentity";
import { currentResourceSummary, eventActor, eventTargets, fhirResourcePath, hasTraceClockDifference, loadPhaseEvidence, operationalPhaseTime, readTraceResource, traceActionLabels, type PhaseEvidence } from "@/services/mpi/identityTrace";
import styles from "./IdentityTraceDialog.module.css";

const date = (value?: string) => value && DateTime.fromISO(value).isValid
  ? DateTime.fromISO(value).setZone("America/Santiago").toFormat("dd/MM/yyyy HH:mm:ss ZZZZ") : "Fecha no consignada";
const resourceLabels: Record<string, string> = { Patient: "Paciente", Encounter: "Visita o atención", Observation: "Observación o resultado", AllergyIntolerance: "Alergia", Condition: "Condición clínica" };
function canRead(ref: string) { try { fhirResourcePath(ref); return true; } catch { return false; } }

function Phase({ evidence, row, onSelect }: { evidence: PhaseEvidence; row: IdentityCase; onSelect: (ref: string) => void }) {
  const event = evidence.provenance || evidence.audit;
  if (!event && !evidence.issues.length) return null;
  const merge = evidence.phase === "merge";
  const targets = evidence.provenance ? eventTargets(evidence.provenance) : evidence.audit ? eventTargets(evidence.audit).filter(r => !r.startsWith("Provenance/")) : [];
  return <article className={styles.phase}>
    <h4><i className={`pi ${merge ? "pi-link" : "pi-clone"}`} aria-hidden="true" /> {merge ? "Fusión" : "Separación"} · evidencia FHIR</h4>
    {event && <><p><strong>{eventActor(event)}</strong> · Fecha FHIR: {date(event.recorded || event.occurredDateTime)}</p>
      {hasTraceClockDifference(row, evidence.phase, event) && <div className={styles.warning} role="alert"><strong>Las fechas de las fuentes requieren revisión.</strong><p>El historial operativo registra {date(operationalPhaseTime(row, evidence.phase))}. La fecha FHIR difiere en más de cinco minutos. Consulte ambas fuentes; no se ajustan sus valores automáticamente.</p></div>}
      <p><strong>Motivo:</strong> {event.reason?.map(r => r.text).filter(Boolean).join("; ") || event.outcomeDesc || "No consignado en el evento."}</p>
      <p>{merge ? "La fusión conserva una ficha vigente y vincula la ficha reemplazada mediante Patient.link."
        : "La separación restituye la pertenencia de los antecedentes y retira los vínculos de esta fusión; conserva la evidencia de ambas acciones."}</p>
      <p className={styles.muted}>{targets.length} recursos identificados en la evidencia de esta operación. El contenido de los recursos se consulta en su estado actual.</p>
      <details><summary>Consultar recursos afectados ({targets.length})</summary><ul className={styles.resources}>{targets.map(ref => <li key={ref}>
        <Button label={resourceLabels[ref.split("/")[0]!] || ref.split("/")[0]} outlined size="small" disabled={!canRead(ref)} onClick={() => onSelect(ref)} />
        <span>{ref}</span></li>)}</ul></details>
    </>}
    {evidence.issues.length > 0 && <div role="alert" className="error-banner"><p>La evidencia FHIR está incompleta. Esto no cambia el resultado registrado del caso.</p>{evidence.issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
    {evidence.provenance && <details><summary>Procedencia de la acción · Provenance</summary><pre tabIndex={0} role="region" aria-label={`JSON Provenance de ${merge ? "fusión" : "separación"}`}>{JSON.stringify(evidence.provenance, null, 2)}</pre></details>}
    {evidence.audit && <details><summary>Registro de auditoría · AuditEvent</summary><pre tabIndex={0} role="region" aria-label={`JSON AuditEvent de ${merge ? "fusión" : "separación"}`}>{JSON.stringify(evidence.audit, null, 2)}</pre></details>}
  </article>;
}

function TraceContent({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string>();
  const currentPanel = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) currentPanel.current?.scrollIntoView({ block: "start" }); }, [selected]);
  const row = useQuery({ queryKey: ["identity-trace", user?.uuid, caseId], queryFn: () => getIdentityCase(caseId), retry: false, refetchOnWindowFocus: false, gcTime: 0 });
  const evidence = useQuery({ queryKey: ["identity-trace-fhir", user?.uuid, caseId, row.data?.version],
    queryFn: ({ signal }) => Promise.all((["merge", "split"] as const).map(phase => loadPhaseEvidence(row.data!, phase, signal))),
    enabled: Boolean(row.data?.clinical), retry: false, refetchOnWindowFocus: false, gcTime: 0 });
  const resource = useQuery({ queryKey: ["identity-trace-resource", user?.uuid, selected], queryFn: ({ signal }) => readTraceResource(selected!, signal),
    enabled: Boolean(selected), retry: false, refetchOnWindowFocus: false, gcTime: 0 });
  const history = row.data?.history;
  const clinical = row.data?.clinical;
  const chartLabel = (key: "preferred" | "secondary") => clinical?.preview?.[key]?.identifiers?.find(i => i.preferred)?.identifier
    || (key === "preferred" ? clinical?.preferredUuid : clinical?.secondaryUuid);
  const refresh = () => { void row.refetch(); if (clinical) void evidence.refetch(); if (selected) void resource.refetch(); };
  return <div className={styles.content}>
    <p className={styles.lead}>Consulte quién actuó, cuándo y por qué. Esta vista no modifica las fichas.</p>
    <Button className={styles.refresh} label="Actualizar historial" icon="pi pi-refresh" outlined loading={row.isFetching || evidence.isFetching || resource.isFetching} onClick={refresh} />
    {row.isPending && <p role="status">Cargando historial…</p>}
    {row.isError && <p role="alert" className="error-banner">{row.error.message}</p>}
    {row.data && <>
      <p><strong>{row.data.clinicalNumber ? `Ficha ${row.data.clinicalNumber}` : "Caso de identidad"}</strong><br /><small className={styles.muted}>Caso {caseId}</small></p>
      {clinical && <div className={styles.pair}><div><strong>Ficha principal de la fusión</strong><span>{chartLabel("preferred")}</span></div><div><strong>Segunda ficha</strong><span>{chartLabel("secondary")}</span></div></div>}
      <section aria-label="Acciones registradas"><h3>Acciones registradas</h3>
        {history?.length ? <ol className={styles.timeline}>{[...history].sort((a, b) => (a.at || "").localeCompare(b.at || "")).map((entry, index) => <li key={`${entry.at}-${index}`}>
          <h4>{traceActionLabels[entry.event] || "Acción registrada"}</h4><p><strong>{entry.actor || "Responsable no consignado"}</strong> · {date(entry.at)}</p>
          <p><strong>Motivo:</strong> {entry.reason || (entry.event === "requested" ? row.data.reason : "No consignado en el historial.")}</p>
        </li>)}</ol> : <p>No hay un historial detallado disponible para este caso. No se reconstruyen acciones a partir del estado actual.</p>}
      </section>
      <section aria-label="Evidencia FHIR"><h3>Evidencia FHIR de las operaciones</h3>
        <p>Provenance y AuditEvent conservan la evidencia de las acciones completadas. No son copias históricas del contenido clínico.</p>
        {evidence.isFetching && <p role="status">Consultando evidencia FHIR…</p>}
        {evidence.isError && <p role="alert" className="error-banner">No se pudo consultar la evidencia FHIR. Actualice para reintentar.</p>}
        {!clinical && <p>Este caso todavía no tiene una operación de fusión clínica asociada.</p>}
        {evidence.data?.map(phase => <Phase key={phase.phase} evidence={phase} row={row.data} onSelect={setSelected} />)}
        {clinical && evidence.data?.every(p => !p.provenance && !p.audit && !p.issues.length) && <p>No hay eventos FHIR de fusión o separación disponibles para esta operación.</p>}
        {clinical && <details><summary>Identificador de la operación</summary><p className={styles.muted}>{clinical.operationId}</p></details>}
      </section>
      {selected && <section ref={currentPanel} className={styles.current} aria-label="Estado FHIR actual" aria-live="polite"><h3>Estado FHIR actual</h3><p className={styles.ref}>{selected}</p>
        <p>Lectura actual de OpenMRS. Puede reflejar una separación u otra modificación posterior a la acción seleccionada. No se dispone de versiones históricas FHIR en esta vista.</p>
        {resource.isFetching && <p role="status">Consultando recurso…</p>}
        {resource.isError && <p role="alert" className="error-banner">{resource.error.message}</p>}
        {resource.data && <><p><strong>{currentResourceSummary(resource.data)}</strong></p><p className={styles.muted}>Consultado: {date(new Date(resource.dataUpdatedAt).toISOString())}</p><details open><summary>Contenido FHIR actual</summary><pre tabIndex={0} role="region" aria-label="JSON del recurso actual">{JSON.stringify(resource.data, null, 2)}</pre></details></>}
      </section>}
    </>}
  </div>;
}
export function IdentityTraceDialog({ row, onHide }: { row?: IdentityCase; onHide: () => void }) {
  return <Dialog header="Historial y trazabilidad" visible={Boolean(row)} onHide={onHide} modal className={styles.dialog}
    style={{ width: "64rem", maxWidth: "96vw" }} breakpoints={{ "640px": "96vw" }} footer={<Button label="Cerrar historial" outlined onClick={onHide} />}>
    {row && <TraceContent key={row.id} caseId={row.id} />}
  </Dialog>;
}
