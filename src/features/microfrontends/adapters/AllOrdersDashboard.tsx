import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { TabPanel, TabView } from "primereact/tabview";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { getDashboardDrugOrders, getDashboardOrders, getObservationsByConceptUuid, getOrderTypes, getStandardOrders, sendPatientEmail, type DashboardRecord } from "@/services/bahmni/dashboard";
import type { BahmniMfeProps } from "../types";

type FixedOrderKey = "laboratory" | "imaging" | "procedure" | "referral";
type GroupKey = FixedOrderKey | "medication" | "indicaciones_paciente";
interface OrderRow { id: string; number: string; name: string; detail: string; date?: string | number; provider: string; status: string; visitUuid?: string; raw: DashboardRecord }
interface OrderGroup { key: GroupKey; label: string; filePrefix: string; records: OrderRow[]; error?: boolean }

const definitions: Array<{ key: FixedOrderKey; label: string; filePrefix: string; orderType: string }> = [
  { key: "laboratory", label: "Laboratorio", filePrefix: "Laboratorio", orderType: "Lab Order" },
  { key: "imaging", label: "Imagenología", filePrefix: "Imagenologia", orderType: "Radiology Order" },
  { key: "procedure", label: "Procedimientos", filePrefix: "Procedimientos", orderType: "Procedure Order" },
  { key: "referral", label: "Derivaciones", filePrefix: "Derivaciones", orderType: "Referral Order" },
];

// Migración tipada de micro-frontends/src/next-ui/config/dashboardConfig.js.
// Sólo se registran los formularios utilizados por HCSBA; no se ejecuta JavaScript remoto.
const formSections = [{
  key: "indicaciones_paciente" as const,
  label: "Indicaciones al Paciente",
  filePrefix: "Indicaciones",
  observationConceptUuid: "b320c274-d39b-4a51-b091-df5ca8768a69",
}];

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  const item = record(value); return text(item.display ?? item.name ?? item.valueAsString ?? item.uuid);
};
const visitOf = (item: DashboardRecord) => text(record(record(item.encounter).visit).uuid ?? item.visitUuid).replace("—", "") || undefined;
const providerOf = (item: DashboardRecord) => text(typeof item.provider === "string" ? item.provider : record(record(item.orderer).person).display ?? record(item.orderer).display ?? item.providerName);
const conceptOf = (item: DashboardRecord) => text(item.conceptName ?? record(item.concept).display ?? record(item.concept).name ?? item.orderName);
const mapOrder = (item: DashboardRecord, index: number): OrderRow => ({
  id: text(item.uuid ?? item.orderUuid ?? `${index}`), number: text(item.orderNumber), name: conceptOf(item), detail: text(item.commentToFulfiller ?? item.instructions ?? item.notes),
  date: item.orderDate as string | number | undefined ?? item.dateActivated as string | number | undefined ?? item.scheduledDate as string | number | undefined,
  provider: providerOf(item), status: text(item.urgency ?? item.action ?? item.status), visitUuid: visitOf(item), raw: item,
});
const mapDrug = (item: DashboardRecord, index: number): OrderRow => {
  const dosing = record(item.dosingInstructions); const units = text(record(dosing.doseUnits).display).replace("—", ""); const frequency = text(record(dosing.frequency).display).replace("—", "");
  const dose = dosing.dose !== undefined ? `${text(dosing.dose)} ${units}`.trim() : ""; const duration = item.duration ? `${text(item.duration)} ${text(record(item.durationUnits).display)}` : "";
  return { ...mapOrder(item, index), name: text(record(item.drug).display ?? record(item.drug).name ?? item.drugNonCoded ?? item.drugName), detail: [dose, frequency, duration, dosing.administrationInstructions].filter(Boolean).map(text).join(" · ") || "—" };
};
const mapFormObservation = (item: DashboardRecord, index: number): OrderRow => ({
  id: text(item.uuid ?? `indication-${index}`),
  number: "—",
  name: text(record(item.concept).display ?? "Indicaciones al paciente"),
  detail: text(item.valueText ?? record(item.value).display ?? item.value),
  date: item.obsDatetime as string | number | undefined ?? record(item.encounter).encounterDatetime as string | number | undefined,
  provider: "—",
  status: "Registrada",
  visitUuid: visitOf(item),
  raw: item,
});

async function loadGroups(patientUuid: string): Promise<OrderGroup[]> {
  const orderTypes = await getOrderTypes();
  const resolved = definitions.map((definition) => ({ ...definition, uuid: orderTypes.find((type) => {
    const name = (type.display ?? type.name ?? "").toLowerCase(); const target = definition.orderType.toLowerCase();
    return name === target || name.includes(target.split(" ")[0]!);
  })?.uuid }));
  const settled = await Promise.allSettled(resolved.map(async (definition): Promise<OrderGroup> => {
    if (!definition.uuid) return { key: definition.key, label: definition.label, filePrefix: definition.filePrefix, records: [] };
    let orders = await getDashboardOrders({ patientUuid, orderTypeUuid: definition.uuid, numberOfVisits: 20, includeObs: true });
    if (!orders.length) orders = await getStandardOrders({ patientUuid, orderTypeUuid: definition.uuid });
    return { key: definition.key, label: definition.label, filePrefix: definition.filePrefix, records: orders.map(mapOrder) };
  }));
  const groups = settled.map((result, index): OrderGroup => result.status === "fulfilled" ? result.value : { key: resolved[index]!.key, label: resolved[index]!.label, filePrefix: resolved[index]!.filePrefix, records: [], error: true });
  try {
    const drugs = await getDashboardDrugOrders(patientUuid);
    groups.splice(2, 0, { key: "medication", label: "Medicamentos", filePrefix: "Medicamentos", records: drugs.map(mapDrug) });
  } catch { groups.splice(2, 0, { key: "medication", label: "Medicamentos", filePrefix: "Medicamentos", records: [], error: true }); }
  const formResults = await Promise.allSettled(formSections.map(async (section): Promise<OrderGroup> => {
    const observations = await getObservationsByConceptUuid({ patientUuid, conceptUuid: section.observationConceptUuid });
    return { key: section.key, label: section.label, filePrefix: section.filePrefix, records: observations.map(mapFormObservation) };
  }));
  formResults.forEach((result, index) => {
    const section = formSections[index]!;
    groups.push(result.status === "fulfilled" ? result.value : { key: section.key, label: section.label, filePrefix: section.filePrefix, records: [], error: true });
  });
  return groups;
}

async function pdfDocument(definition: TDocumentDefinitions, mode: "base64" | "blob"): Promise<string | Blob> {
  const [{ default: pdfMake }, pdfFonts] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.vfs = pdfFonts.vfs;
  const document = pdfMake.createPdf(definition);
  return new Promise((resolve) => mode === "base64" ? document.getBase64(resolve) : document.getBlob(resolve));
}

function documentFor(group: OrderGroup, patient: BahmniMfeProps["hostData"]["patient"], institution: string, locale: string): TDocumentDefinitions {
  const date = (value: string | number | undefined) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "—";
  const body: TableCell[][] = [
    ["N.º", "Prestación / medicamento", "Detalle", "Fecha", "Profesional", "Estado"].map((value) => ({ text: value, bold: true, fillColor: "#e7f5f8" })),
    ...group.records.map((item) => [item.number, item.name, item.detail, date(item.date), item.provider, item.status]),
  ];
  const content: Content[] = [{ text: institution, style: "institution" }, { text: `Órdenes de ${group.label}`, style: "title" }, { text: `${patient.name} · ${patient.identifier}`, margin: [0, 0, 0, 12] }, { table: { headerRows: 1, widths: [55, "*", "*", 65, "*", 55], body }, layout: "lightHorizontalLines" }];
  return { pageOrientation: "landscape", content, styles: { institution: { fontSize: 11, bold: true, color: "#006a88" }, title: { fontSize: 18, bold: true, margin: [0, 4, 0, 6] } }, defaultStyle: { fontSize: 8 } };
}

function OrdersTable({ group, locale, onPrint }: { group: OrderGroup; locale: string; onPrint(row?: OrderRow): void }) {
  if (group.error) return <p role="alert" className="error-banner">No fue posible cargar esta familia de órdenes.</p>;
  if (!group.records.length) return <p className="muted-text">No hay órdenes registradas para este tipo.</p>;
  return <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>N.º</th><th>Prestación / medicamento</th><th>Detalle</th><th>Fecha</th><th>Profesional</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{group.records.map((row) => <tr key={row.id}><td>{row.number}</td><td>{row.name}</td><td>{row.detail}</td><td>{row.date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.date)) : "—"}</td><td>{row.provider}</td><td>{row.status}</td><td><Button text rounded icon="pi pi-print" aria-label={`Imprimir ${row.name}`} onClick={() => onPrint(row)} /></td></tr>)}</tbody></table></div>;
}

export function AllOrdersDashboard({ hostData, hostApi }: BahmniMfeProps) {
  const [visitUuid, setVisitUuid] = useState<string>(hostData.visitUuid ?? hostData.visits[0]?.uuid ?? "all");
  const [busy, setBusy] = useState<string>(); const [message, setMessage] = useState<{ type: "success" | "error"; text: string }>();
  const [shareGroups, setShareGroups] = useState<OrderGroup[]>();
  const query = useQuery({ queryKey: ["clinical", "all-orders", hostData.patientUuid], queryFn: () => loadGroups(hostData.patientUuid) });
  const institution = hostData.location?.display ?? hostData.location?.name ?? "HCSBA";
  const providerName = text(record(hostData.provider?.person).display ?? hostData.provider?.display ?? institution);
  const patientEmail = hostData.patient.attributes.find((attribute) => ["email", "correo"].some((term) => attribute.label.toLocaleLowerCase(hostData.locale).includes(term)))?.value;
  const groups = useMemo(() => (query.data ?? []).map((group) => ({ ...group, records: visitUuid === "all" ? group.records : group.records.filter((record) => record.visitUuid === visitUuid) })), [query.data, visitUuid]);
  const visitOptions = [{ label: "Todas las visitas", value: "all" }, ...hostData.visits.map((visit) => ({ label: `${visit.visitType?.display ?? visit.visitType?.name ?? "Visita"} · ${new Intl.DateTimeFormat(hostData.locale, { dateStyle: "medium" }).format(new Date(visit.startDatetime))}`, value: visit.uuid }))];
  if (hostData.visitUuid && !visitOptions.some((option) => option.value === hostData.visitUuid)) visitOptions.push({ label: "Visita seleccionada", value: hostData.visitUuid });
  const printGroup = async (group: OrderGroup, row?: OrderRow) => {
    const selected = row ? { ...group, records: [row] } : group; setBusy(`print-${group.key}`); setMessage(undefined);
    try { const blob = await pdfDocument(documentFor(selected, hostData.patient, institution, hostData.locale), "blob") as Blob; window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer"); await hostApi.audit("PRINT_ORDERS", group.key); }
    catch { setMessage({ type: "error", text: "No fue posible generar el PDF." }); } finally { setBusy(undefined); }
  };
  const emailGroups = async (selectedGroups: OrderGroup[]) => {
    setBusy("email"); setMessage(undefined);
    try {
      const active = selectedGroups.filter((group) => group.records.length > 0); const today = new Intl.DateTimeFormat(hostData.locale, { dateStyle: "medium" }).format(new Date());
      for (const [index, group] of active.entries()) {
        const data = await pdfDocument(documentFor(group, hostData.patient, institution, hostData.locale), "base64") as string;
        const sequence = active.length > 1 ? `[${index + 1}/${active.length}] ` : "";
        await sendPatientEmail(hostData.patientUuid, { mailAttachments: [{ contentType: "application/pdf", name: `${group.filePrefix}_${hostData.patient.identifier}_${today.replaceAll("/", "-")}.pdf`, data }], subject: `${sequence}Órdenes médicas · ${group.label} · ${hostData.patient.name} · ${today}`, body: `Estimado/a ${hostData.patient.name}:\n\nAdjuntamos sus órdenes de ${group.label}.\n\nAtentamente,\n${providerName}\n${institution}` });
      }
      await hostApi.audit("EMAIL_ORDERS", active.map((group) => group.key).join(",")); setMessage({ type: "success", text: active.length === 1 ? "Correo enviado." : `${active.length} correos enviados, uno por tipo de orden.` }); setShareGroups(undefined);
    } catch { setMessage({ type: "error", text: "No fue posible enviar las órdenes. Verifique el correo registrado del paciente." }); } finally { setBusy(undefined); }
  };
  if (query.isLoading) return <p role="status">Cargando órdenes…</p>;
  if (query.isError) return <p role="alert" className="error-banner">No fue posible cargar los tipos de órdenes.</p>;
  return <div className="all-orders-mfe"><div className="toolbar"><Dropdown value={visitUuid} options={visitOptions} onChange={(event) => setVisitUuid(String(event.value))} /><Button outlined icon="pi pi-envelope" label="Enviar todas" disabled={!groups.some((group) => group.records.length)} onClick={() => setShareGroups(groups)} /></div>{message && <p role={message.type === "error" ? "alert" : "status"} className={message.type === "error" ? "error-banner" : "success-banner"}>{message.text}</p>}<TabView>{groups.map((group) => <TabPanel key={group.key} header={`${group.label} (${group.records.length})`}><div className="dashboard-inline-actions"><Button outlined icon="pi pi-print" label={`PDF ${group.label}`} loading={busy === `print-${group.key}`} disabled={!group.records.length} onClick={() => void printGroup(group)} /><Button outlined icon="pi pi-envelope" label="Enviar" disabled={!group.records.length} onClick={() => setShareGroups([group])} /></div><OrdersTable group={group} locale={hostData.locale} onPrint={(row) => void printGroup(group, row)} /></TabPanel>)}</TabView><Dialog visible={Boolean(shareGroups)} modal header="Compartir órdenes por correo" onHide={() => { if (!busy) setShareGroups(undefined); }} footer={<div className="dashboard-inline-actions"><Button outlined label="Cancelar" disabled={busy === "email"} onClick={() => setShareGroups(undefined)} /><Button icon="pi pi-send" label="Enviar" loading={busy === "email"} disabled={!patientEmail} onClick={() => void emailGroups(shareGroups ?? [])} /></div>}><p>Se enviará un correo por cada tipo de orden, porque el endpoint HCSBA sólo procesa un adjunto por solicitud.</p><p><strong>Paciente:</strong> {hostData.patient.name}</p><p><strong>Correo registrado:</strong> {patientEmail || "El paciente no tiene un correo registrado."}</p><p><strong>Mensajes:</strong> {(shareGroups ?? []).filter((group) => group.records.length).length}</p></Dialog></div>;
}
