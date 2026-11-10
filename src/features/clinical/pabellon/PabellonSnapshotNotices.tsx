import type { PabellonItem } from "@/services/bahmni/pabellon";

type Notice = { text: string; kind: "info" | "review" };
const messages: Record<string, Notice> = {
  STATE_AND_SCHEDULE_ARE_HISTORICAL: { kind: "info", text: "Estado y programación corresponden a la snapshot clínica; el seguimiento operativo se muestra por separado." },
  OPERATIONAL_SNAPSHOT_NOT_TRACKED: { kind: "info", text: "Registro sin captura de seguimiento operativo; no acredita el estado actual." },
  SNAPSHOT_SCHEDULE_UNAVAILABLE: { kind: "info", text: "Programación no informada en esta snapshot. No permite concluir si la cirugía está programada actualmente." },
  REQUEST_SNAPSHOT_UNAVAILABLE: { kind: "review", text: "Snapshot de solicitud no disponible en el origen." },
  REQUEST_SNAPSHOT_INVALID: { kind: "review", text: "La snapshot de solicitud contiene datos inconsistentes y requiere revisión." },
  REQUEST_SNAPSHOT_AMBIGUOUS: { kind: "review", text: "No se puede identificar una única snapshot vigente." },
  REQUEST_SNAPSHOT_MULTIPLE_LATEST: { kind: "review", text: "El origen marca varias snapshots como vigentes." },
  REQUEST_SNAPSHOT_LATEST_UNMARKED: { kind: "review", text: "La snapshot no tiene una marca de versión vigente." },
  REQUEST_SNAPSHOT_LATEST_BEHIND_MAX_VERSION: { kind: "review", text: "La versión marcada vigente no coincide con la versión más reciente." },
  REQUEST_NUMBER_UNAVAILABLE: { kind: "review", text: "Número de solicitud no disponible en el registro de origen." },
  REQUEST_ORIGIN_UNKNOWN: { kind: "review", text: "No se pudo determinar si la solicitud es normal, regularizada o urgente." },
  SNAPSHOT_PATIENT_UNAVAILABLE: { kind: "review", text: "Datos del paciente no incluidos en la snapshot de solicitud." },
  PATIENT_PHOTO_UNAVAILABLE: { kind: "review", text: "Fotografía de datos del paciente al registrar no disponible; no se refiere a una imagen." },
  PATIENT_PHOTO_AMBIGUOUS: { kind: "review", text: "Hay varias fotografías de datos del paciente para esta cirugía." },
  SNAPSHOT_PROCEDURES_UNAVAILABLE: { kind: "review", text: "Plan quirúrgico no informado en la snapshot." },
  URGENCY_COMPLETENESS_UNKNOWN: { kind: "review", text: "No se pudo verificar si la solicitud de urgencia está completa." },
  URGENCY_COMPLETENESS_NOT_PROVEN: { kind: "review", text: "La snapshot no acredita que la solicitud de urgencia esté completa." },
  URGENCY_LINK_AMBIGUOUS: { kind: "review", text: "La relación de esta cirugía con su solicitud de urgencia requiere revisión." },
  HOSPITALIZATION_UNKNOWN: { kind: "review", text: "El registro de origen no informa el dato de hospitalización." },
  SCHEDULE_ACTIVITY_UNKNOWN: { kind: "review", text: "No se pudo determinar la vigencia de una programación del origen." },
  SCHEDULE_LOCATION_UNKNOWN: { kind: "review", text: "Una programación del origen no informa su ubicación." },
  MULTIPLE_ACTIVE_SCHEDULES: { kind: "review", text: "El origen informa más de una programación activa para esta cirugía." },
  CONFIRMED_WITHOUT_ACTIVE_SCHEDULE: { kind: "review", text: "El origen informa una cirugía confirmada sin programación activa; requiere revisión." },
};
export function snapshotNotices(item: Pick<PabellonItem, "warningCodes" | "request">): Notice[] {
  const result = [...new Set(item.warningCodes)].map(code => messages[code] ?? {
    kind: "review" as const, text: /^[A-Z0-9_]{1,80}$/.test(code) ? "Advertencia de origen pendiente de clasificar: " + code : "Advertencia de origen pendiente de clasificar.",
  });
  if (item.request?.schedulesAtSnapshot?.length === 0) result.push({ kind: "info", text: "Sin programación registrada en esta snapshot." });
  return result;
}
export function PabellonSnapshotNotices({ item }: { item: Pick<PabellonItem, "warningCodes" | "request"> }) {
  const notices = snapshotNotices(item);
  if (!notices.length) return null;
  const reviews = notices.filter(notice => notice.kind === "review").length;
  return <details aria-label="Información de la snapshot">
    <summary>{notices.length === 1 ? notices[0]!.text : reviews ? `${reviews} dato(s) por revisar · ${notices.length - reviews} nota(s) informativa(s)` : `${notices.length} notas informativas del registro`}</summary>
    <ul>{notices.map(notice => <li key={notice.text}><strong>{notice.kind === "review" ? "Por revisar: " : "Información: "}</strong>{notice.text}</li>)}</ul>
    {reviews > 0 && <p>Requiere revisar la causa en Pabellón. Consultar o esperar no completa estos datos automáticamente.</p>}
  </details>;
}
