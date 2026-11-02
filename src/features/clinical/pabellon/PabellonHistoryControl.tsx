import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useState } from "react";
import type { DashboardControlProps } from "../dashboardContext";
import { getPabellonHistory, mergePabellonPages, PabellonReadError, type PabellonItem } from "@/services/bahmni/pabellon";
import { PabellonProtocolsDialog } from "./PabellonProtocolsDialog";
import { ClinicalBlock, ClinicalField } from "./PabellonClinicalBlock";
import styles from "./PabellonProtocols.module.css";

const labels: Record<string, string> = { normal: "Normal", regularization: "Regularizada", urgency: "Urgencia", unknown: "Origen no determinado" };
const label = (code: { display: string | null; code: string } | null | undefined) => code?.display || code?.code || "—";
const dateLabel = (date: { rawValue: string; interpretation: string } | null | undefined) => date ? date.rawValue + (date.interpretation === "unresolved" ? " (zona horaria no resuelta)" : "") : "—";

function RequestDetail({ item }: { item: PabellonItem }) {
  const data = item.request; if (!data) return null;
  const name = data.patientAtRegistration;
  return <div className={styles.detail}>
    <ClinicalBlock title="Identificación de la solicitud" icon="pi-id-card">
      <h3 className={styles.patient}>{[name?.givenNames, name?.familyName, name?.secondFamilyName].filter(Boolean).join(" ") || "Nombre no disponible en esta snapshot"}</h3>
      <p className={styles.version}>Versión clínica: {item.requestSnapshot.version ?? "—"} · Captura: {dateLabel(item.requestSnapshot.capturedAt)}</p>
      <dl className={styles.grid}><ClinicalField title="Origen">{labels[data.origin]}</ClinicalField><ClinicalField title="Estado según snapshot">{label(data.stateAtSnapshot)}</ClinicalField></dl>
    </ClinicalBlock>
    <ClinicalBlock title="Información clínica" icon="pi-heart"><dl className={styles.fields}>
      <ClinicalField title="Diagnóstico">{data.diagnosis}</ClinicalField><ClinicalField title="Especialidad">{label(data.specialty)}</ClinicalField><ClinicalField title="Prestaciones">{data.plannedProcedures?.map(label).join(" · ")}</ClinicalField>
    </dl></ClinicalBlock>
    <ClinicalBlock title="Hospitalización y servicio de ingreso" icon="pi-building"><dl className={styles.grid}>
      <ClinicalField title="Paciente hospitalizado">{data.hospitalization.value === null ? "—" : data.hospitalization.value ? "Sí" : "No"}{data.hospitalization.provenance === "legacy-default" ? " (registro histórico)" : ""}</ClinicalField><ClinicalField title="Servicio de ingreso">{label(data.admissionService)}</ClinicalField>
    </dl></ClinicalBlock>
    <ClinicalBlock title="Información de programación" icon="pi-calendar">
    <p>Información conservada en esta snapshot; no se completa desde la agenda actual.</p>
    {!data.schedulesAtSnapshot?.length ? <p>Sin información de programación en esta captura.</p> : <div className={styles.fields}>{data.schedulesAtSnapshot.map((schedule) => <dl className={styles.fields} key={schedule.sourceId}><ClinicalField title="Quirófano asignado">{label(schedule.theatre)} / {label(schedule.room)}</ClinicalField><ClinicalField title="Fecha/hora de inicio">{dateLabel(schedule.start)}</ClinicalField><ClinicalField title="Fecha/hora de salida">{dateLabel(schedule.end)}</ClinicalField>{schedule.active !== true && <ClinicalField title="Vigencia de la programación">{schedule.active === false ? "Histórica/inactiva" : "No informada"}</ClinicalField>}</dl>)}</div>}
    </ClinicalBlock><ClinicalBlock title="Seguimiento operativo" icon="pi-history">
    {!data.operationalAtSnapshot ? <p>Esta snapshot no contiene una captura operativa verificada. No se interpreta como estado actual.</p> : <>
      <p>Actualización: {dateLabel(data.operationalAtSnapshot.updatedAt)}</p>
      <ul className={styles.timeline}>{data.operationalAtSnapshot.events.map((event) => <li key={event.sourceId}><strong>{label(event.type)} · {label(event.option)}</strong><span>{dateLabel(event.occurredAt)}{!event.active ? " · Histórico/inactivo" : ""}</span></li>)}</ul>
      {data.operationalAtSnapshot.events.length === 0 && <p>Sin hitos en esta captura operativa.</p>}
    </>}</ClinicalBlock>
  </div>;
}

export function PabellonHistoryControl({ context, section, reportState }: DashboardControlProps) {
  const patientUuid = context.patient.uuid;
  const actorUuid = context.user?.uuid ?? "";
  const enabled = section.config.source === "qa-isolated" && Boolean(actorUuid && patientUuid);
  const viewKey = actorUuid + ":" + patientUuid;
  const [selected, setSelected] = useState<string | null>(null);
  const [protocolSelection, setProtocolSelection] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["pabellon-history-qa", actorUuid, patientUuid], enabled, initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPabellonHistory(patientUuid, pageParam, signal), getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  let items: PabellonItem[] = []; let contractError: unknown;
  try { items = mergePabellonPages(query.data?.pages ?? []); } catch (error) { contractError = error; }
  const error = query.error ?? contractError;
  useEffect(() => reportState({ settled: enabled && !query.isPending && !error, empty: enabled && !query.isPending && !error && items.length === 0 }), [enabled, query.isPending, error, items.length, reportState]);
  const detail = items.find((item) => selected === viewKey + ":" + item.id);
  const protocolItem = items.find((item) => protocolSelection === viewKey + ":" + item.id);
  const refresh = () => { setSelected(null); setProtocolSelection(null); void query.refetch({ cancelRefetch: false }); };
  if (!enabled) return <p role="status">Integración no configurada. Este control requiere activación explícita del ámbito QA.</p>;
  if (query.isPending) return <p role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando Pabellón…</p>;
  if (error) return <div role="alert" className="error-banner"><p>{error instanceof PabellonReadError ? error.message : "No fue posible consultar Pabellón."}</p><Button label="Reintentar" icon="pi pi-refresh" loading={query.isFetching} disabled={query.isFetching} onClick={refresh} /></div>;
  return <div>
    <p role="note" className="warning-banner">Entorno QA: solo datos sintéticos. No utilizar para atención clínica.</p>
    <p>Datos de la solicitud desde su snapshot. Las capturas sin seguimiento operativo no acreditan el estado actual.</p>
    <Button label="Actualizar" icon="pi pi-refresh" loading={query.isFetching} disabled={query.isFetching} onClick={refresh} />
    {!items.length ? <p>Sin solicitudes registradas para el paciente vinculado.</p> : <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>N° solicitud</th><th>Origen</th><th>Especialidad</th><th>Estado según snapshot</th><th>Snapshot</th><th>Detalle</th></tr></thead><tbody>{items.map((item) => <tr key={item.source.system + ":" + item.source.environment + ":" + item.id}>
      <td>{item.request?.requestNumber ?? "No disponible"}</td><td>{item.request ? labels[item.request.origin] : "—"}</td><td>{label(item.request?.specialty)}</td><td>{label(item.request?.stateAtSnapshot)}</td>
      <td>{item.requestSnapshot.status === "available" ? "Versión " + item.requestSnapshot.version : item.requestSnapshot.status === "unavailable" ? "No disponible" : "Requiere revisión"}{item.warningCodes.length > 0 && <small> · Información histórica incompleta</small>}</td>
      <td><span className="dashboard-inline-actions"><Button text icon="pi pi-eye" label="Ver solicitud" disabled={!item.request || query.isFetching} onClick={() => setSelected(viewKey + ":" + item.id)} /><Button text icon="pi pi-file" label="Protocolos" disabled={query.isFetching} onClick={() => setProtocolSelection(viewKey + ":" + item.id)} /></span></td>
    </tr>)}</tbody></table></div>}
    {query.hasNextPage && <Button label="Cargar más" loading={query.isFetchingNextPage} disabled={query.isFetching} onClick={() => { void query.fetchNextPage({ cancelRefetch: false }); }} />}
    <Dialog modal maximizable visible={Boolean(detail && !query.isFetching)} header={"Solicitud " + (detail?.request?.requestNumber ?? "")} onHide={() => setSelected(null)} style={{ width: "min(900px, 95vw)" }}>{detail && <RequestDetail item={detail} />}</Dialog>
    {protocolItem && <PabellonProtocolsDialog key={viewKey + ":" + protocolItem.id} actorUuid={actorUuid} patientUuid={patientUuid} surgeryId={protocolItem.id} onHide={() => setProtocolSelection(null)} />}
  </div>;
}
