import Link from "next/link";
import Image from "next/image";
import Cookies from "js-cookie";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Avatar } from "primereact/avatar";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";
import type { JsonObject } from "@/config-compat/merge";
import { ClinicalMfeHost } from "@/features/microfrontends/MfeHost";
import { loadAppConfig, loadAppTextAsset } from "@/services/bahmni/config";
import { getPatientConditionHistory, getPatientDiagnoses, getPatientObservations, getPatientPrograms, type ClinicalRecord } from "@/services/bahmni/clinical";
import { discardGesNotification, getAppointments, getAssignedBed, getBacteriologyResults, getDashboardOrders, getDiseaseSummaryData, getDispositions, getDrugOrderDetails, getDrugRegimen, getEncountersForEncounterType, getGesNotifications, getIpdVisitMedications, getLabOrderResults, getObservationEncounterUuid, getObservationFlowSheet, getOrderTypes, getPrescribedAndActiveDrugOrders, sendPatientEmail, type DashboardRecord } from "@/services/bahmni/dashboard";
import { getEncounterConfiguration } from "@/services/bahmni/metadata";
import type { Visit } from "@/types/bahmni";
import type { DashboardControlProps } from "./dashboardContext";
import { appointmentMeetingUrl, normalizeAppointments, type DashboardAppointment } from "./appointments";
import { mapBacteriologySpecimens } from "./bacteriology";
import { normalizeDrugOrders, normalizeTreatmentSections, type DrugOrderRow, type TreatmentSection } from "./drugOrders";
import { normalizeConditionHistories } from "./conditions";
import { groupLabAccessions, isAbnormalLabResult, labResultFor, labTabularModel, normalRange, type LabRecord } from "./labResults";
import { differenceInMonths, parseObservationGraphReference, type GraphReferenceLine } from "./observationGraph";
import { mapRadiologyDocuments } from "./radiologyDocuments";
import { resolveClinicalNavigationLinks } from "./navigationLinks";
import { AllergyHeaderAction } from "./allergies/AllergyHeaderAction";
import { AllergyDashboardControl } from "./allergies/AllergyDashboardControl";
import { normalizeDashboardDiagnoses } from "./diagnosisRecords";
import { BedIcon } from "./BedIcon";
import { normalizeOrderFulfillmentRecords } from "./orderFulfillmentRecords";
import { normalizeDashboardPrograms } from "./programRecords";
import { normalizeAdmissionDetails } from "./admissionDetails";
import { renderTreatmentPdf, treatmentDocument } from "./treatmentDocument";
import { IpdTreatmentScheduleDialog } from "@/features/ipd/ipd-dashboard/IpdTreatmentScheduleDialog";
import { resolveTreatmentScheduleAction, type TreatmentScheduleAction, type TreatmentScheduleConfig } from "@/features/ipd/ipd-dashboard/treatmentSchedule";
import { getPrnScheduledOrderUuids } from "@/services/bahmni/ipdTreatments";

export interface DashboardControlAdapter {
  type: string;
  Component: ComponentType<DashboardControlProps>;
  HeaderAction?: ComponentType<Pick<DashboardControlProps, "section" | "context">>;
  supportsExpanded: boolean;
  capabilities: readonly ("read" | "edit" | "print" | "navigate" | "share")[];
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const valueOf = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueOf).filter((item) => item !== "—").join(", ") || "—";
  const item = asRecord(value);
  return valueOf(item.display ?? item.shortName ?? item.name ?? item.label ?? item.valueAsString ?? item.value ?? item.uuid);
};
const dateOf = (value: unknown, locale = "es-CL", timeZone?: string) => {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return valueOf(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(date);
};
const dateOnlyOf = (value: unknown, locale = "es-CL", timeZone?: string) => {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return valueOf(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...(timeZone ? { timeZone } : {}) }).format(date);
};
const arrayConfig = (config: JsonObject, name: string): string[] => Array.isArray(config[name]) ? (config[name] as unknown[]).filter((value): value is string => typeof value === "string") : [];
const activeConfig = ({ section, expanded }: DashboardControlProps): JsonObject => ({
  ...section.raw,
  ...section.config,
  ...section.dashboardConfig,
  ...(expanded ? section.expandedViewConfig : {}),
});

function useReport(props: DashboardControlProps, loading: boolean, error: unknown, count: number) {
  const { reportState } = props;
  useEffect(() => reportState({ settled: !loading && !error, empty: !loading && !error && count === 0 }), [count, error, loading, reportState]);
}

function QueryFrame({ loading, error, empty, retry, children }: { loading: boolean; error: unknown; empty: boolean; retry(): void; children: React.ReactNode }) {
  if (loading) return <p role="status">Cargando…</p>;
  if (error) return <div role="alert" className="error-banner dashboard-control-error"><span>No fue posible cargar este control.</span><Button text label="Reintentar" icon="pi pi-refresh" onClick={retry} /></div>;
  if (empty) return <p className="muted-text">Sin datos registrados.</p>;
  return <>{children}</>;
}

function RecordTable({ records, locale, timeZone, displayNameType, showDetailsButton = false }: { records: Record<string, unknown>[]; locale: string; timeZone: string; displayNameType?: unknown; showDetailsButton?: boolean }) {
  return <div className="dashboard-record-table" role="table">{records.map((item, index) => {
    const concept = asRecord(item.concept);
    const coded = asRecord(item.codedAnswer);
    const configuredConceptName = String(displayNameType ?? "").toUpperCase().includes("SHORT") ? concept.shortName ?? concept.name : concept.name ?? concept.shortName;
    const label = valueOf(item.conceptName ?? coded.name ?? configuredConceptName ?? item.orderName ?? item.testName ?? item.drugName ?? item.display ?? item.name ?? item.preferredName ?? item.conceptName ?? `Registro ${index + 1}`);
    const rawValue = item.valueAsString ?? item.value ?? item.result ?? item.freeTextAnswer ?? item.status ?? item.diagnosisStatus ?? item.dose ?? item.notes ?? item.comments;
    const date = item.observationDateTime ?? item.obsDatetime ?? item.orderDate ?? item.encounterDateTime ?? item.dateCreated ?? item.date;
    const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
    const lowNormal = Number(item.lowNormal ?? concept.lowNormal);
    const hiNormal = Number(item.hiNormal ?? concept.hiNormal);
    const outsideConfiguredRange = Number.isFinite(numericValue) && ((Number.isFinite(lowNormal) && numericValue < lowNormal) || (Number.isFinite(hiNormal) && numericValue > hiNormal));
    const abnormal = item.abnormal === true || item.isAbnormal === true || outsideConfiguredRange;
    const units = item.units ?? item.unit ?? concept.units;
    const members = asRecords(item.groupMembers);
    const conceptClass = valueOf(concept.conceptClass).toLowerCase();
    const fileName = typeof rawValue === "string" ? rawValue : undefined;
    const fileHref = fileName ? `/document_images/${fileName.split("/").map(encodeURIComponent).join("/")}` : undefined;
    const isImage = conceptClass === "image";
    const isVideo = conceptClass === "video";
    const isPdf = Boolean(fileName?.toLowerCase().includes(".pdf"));
    const comment = valueOf(item.comment ?? (rawValue !== item.comments ? item.comments : undefined));
    const provider = valueOf(asRecords(item.providers)[0]?.name ?? asRecords(item.providers)[0]?.display ?? item.provider ?? item.creatorName);
    const renderedValue = fileHref && isImage
      ? isPdf ? <a className="dashboard-file-value" href={fileHref} target="_blank" rel="noreferrer"><i className="pi pi-file-pdf" /> Abrir PDF</a> : <a className="dashboard-image-value" href={fileHref} target="_blank" rel="noreferrer"><Image unoptimized src={fileHref} width={72} height={72} alt={label} /></a>
      : fileHref && isVideo ? <a className="dashboard-file-value" href={fileHref} target="_blank" rel="noreferrer"><i className="pi pi-video" /> Abrir video</a>
      : valueOf(rawValue);
    return <div role="row" className={abnormal ? "abnormal" : ""} key={String(item.uuid ?? item.id ?? item.orderUuid ?? index)}><span role="cell"><strong>{label}</strong>{date !== undefined && <small>{dateOf(date, locale, timeZone)}</small>}</span><span role="cell">{renderedValue}{comment !== "—" && <small className="dashboard-record-comment"><i className="pi pi-comment" /> {comment}</small>}{showDetailsButton && provider !== "—" && <small>{provider}</small>}</span>{units !== undefined && <small role="cell">{valueOf(units)}</small>}{members.length > 0 && <div className="dashboard-record-members"><RecordTable records={members} locale={locale} timeZone={timeZone} displayNameType={displayNameType} showDetailsButton={showDetailsButton} /></div>}</div>;
  })}</div>;
}

function PatientInformationControl(props: DashboardControlProps) {
  const { patient } = props.context;
  const config = activeConfig(props);
  const configuredAttributes = arrayConfig(config, "patientAttributes");
  const configuredIdentifiers = arrayConfig(config, "additionalPatientIdentifiers");
  const configuredAddressFields = arrayConfig(config, "addressFields");
  const visibleAttributes = configuredAttributes.flatMap((name) =>
    patient.attributes.find((attribute) => attribute.name === name || attribute.label === name) ?? []);
  const visibleIdentifiers = configuredIdentifiers.flatMap((name) =>
    patient.additionalIdentifiers?.find((identifier) => identifier.name === name || identifier.label === name) ?? []);
  const configuredAddress = configuredAddressFields
    .map((field) => patient.addressFields?.[field])
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const summary = asRecord(props.context.visitSummary);
  const admitted = Boolean(props.context.visit && !props.context.visit.stopDatetime && Object.keys(asRecord(summary.admissionDetails)).length);
  useReport(props, false, null, 1);
  return <div className="clinical-patient-profile">
    <div className="clinical-patient-profile-summary">
      <Avatar image={patient.image} icon="pi pi-user" size="xlarge" shape="circle" />
      <div><strong>{patient.name}</strong><span>{patient.identifier || "—"}</span><small>{[patient.gender, patient.age !== undefined ? `${patient.age} años` : undefined, patient.bloodGroup].filter(Boolean).join(" · ")}</small></div>
      {admitted && <span className="clinical-admission-indicator" role="img" aria-label="Paciente hospitalizado" title="Paciente hospitalizado"><BedIcon /></span>}
    </div>
    <dl className="clinical-details">
      <div><dt>Identificador</dt><dd>{patient.identifier || "—"}</dd></div><div><dt>Nombre</dt><dd>{patient.name}</dd></div><div><dt>Sexo</dt><dd>{patient.gender || "—"}</dd></div><div><dt>Edad</dt><dd>{patient.age ?? "—"}{patient.birthDateEstimated ? " (est.)" : ""}</dd></div>
      {config.showDOB !== false && patient.birthDate && <div><dt>Fecha de nacimiento</dt><dd>{dateOf(patient.birthDate, props.context.locale, props.context.timeZone)}{patient.birthDateEstimated ? " (est.)" : ""}</dd></div>}
      {patient.birthTime && <div><dt>Hora de nacimiento</dt><dd>{dateOf(patient.birthTime, props.context.locale, props.context.timeZone)}</dd></div>}
      <div><dt>Dirección</dt><dd>{configuredAddress || patient.address || "—"}</dd></div>
      {visibleAttributes.map((attribute) => <div key={attribute.name}><dt>{attribute.label}</dt><dd>{attribute.value}</dd></div>)}{visibleIdentifiers.map((identifier) => <div key={identifier.name}><dt>{identifier.label}</dt><dd>{identifier.value}</dd></div>)}
    </dl>
    {patient.relationships.length > 0 && <div className="clinical-relationships"><strong>Relaciones</strong>{patient.relationships.map((relationship) => <div key={relationship.uuid}><span>{relationship.type}</span><Link href={`/clinical/patient/${relationship.personUuid}/dashboard`}>{relationship.personDisplay}</Link></div>)}</div>}
  </div>;
}

function VisitsControl(props: DashboardControlProps) {
  const maximum = Number(activeConfig(props).maximumNoOfVisits ?? 8);
  const visits = props.context.visits.slice(0, Number.isFinite(maximum) ? maximum : 8);
  useReport(props, false, null, visits.length);
  return <div className="clinical-visits">{visits.map((visit: Visit) => <Link className={visit.uuid === props.context.visit?.uuid ? "selected" : ""} key={visit.uuid} href={{ pathname: `/clinical/patient/${props.context.patient.uuid}/dashboard`, query: { visitUuid: visit.uuid } }}><strong>{visit.visitType?.display ?? visit.visitType?.name ?? "Visita"}</strong><span>{dateOf(visit.startDatetime, props.context.locale, props.context.timeZone)}</span><small>{visit.stopDatetime ? `Cerrada ${dateOf(visit.stopDatetime, props.context.locale, props.context.timeZone)}` : "Activa"}</small></Link>)}</div>;
}

function NavigationControl(props: DashboardControlProps) {
  const { t } = useTranslation();
  const { patient, visit } = props.context;
  const links = resolveClinicalNavigationLinks(props.section.raw, patient.uuid, visit?.uuid);
  useReport(props, false, null, links.length);
  const label = (link: (typeof links)[number]) => String(t(link.label, { defaultValue: link.name === "bedManagement" ? "Gestión de cama" : link.label }));
  return <nav className="clinical-links" aria-label="Acciones del paciente">{links.map((link) => link.internal ? <Link key={`${link.name}-${link.href}`} href={link.href}>{label(link)}</Link> : <a key={`${link.name}-${link.href}`} href={link.href} target="_blank" rel="noreferrer">{label(link)}</a>)}</nav>;
}

type RecordKind = "diagnosis" | "condition" | "program";
function RecordsControl(props: DashboardControlProps & { kind: RecordKind }) {
  const { patient, visit } = props.context;
  const query = useQuery({ queryKey: ["clinical-dashboard", props.kind, patient.uuid, visit?.uuid], queryFn: () => props.kind === "diagnosis" ? getPatientDiagnoses(patient.uuid) : props.kind === "condition" ? getPatientConditionHistory(patient.uuid) : getPatientPrograms(patient.uuid) });
  const source = props.kind === "condition"
    ? normalizeConditionHistories(query.data ?? [], props.expanded)
    : query.data ?? [];
  const data = source.map((item) => {
    if (props.kind === "diagnosis") {
      const answer = asRecord(item.codedAnswer);
      return { ...item, display: answer.name ?? answer.display ?? item.freeTextAnswer, value: [item.certainty, item.order, item.diagnosisStatus].filter(Boolean).join(" · "), date: item.diagnosisDateTime, notes: item.comments };
    }
    if (props.kind === "condition") return item;
    const states = asRecords(item.states).map((state) => valueOf(asRecord(asRecord(state.state).concept).display ?? asRecord(state.state).display));
    return { ...item, display: item.display ?? asRecord(item.program).display, value: item.dateCompleted ? `Finalizado · ${valueOf(asRecord(item.outcome).display)}` : "Activo", date: item.dateEnrolled, notes: states.join(" → ") };
  });
  useReport(props, query.isLoading, query.error, data.length);
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!data.length} retry={() => void query.refetch()}><RecordTable records={data} locale={props.context.locale} timeZone={props.context.timeZone} /></QueryFrame>;
}
function DiagnosisControl(props: DashboardControlProps) {
  const { t } = useTranslation();
  const config = activeConfig(props);
  const query = useQuery({ queryKey: ["clinical-dashboard", "diagnosis", props.context.patient.uuid], queryFn: () => getPatientDiagnoses(props.context.patient.uuid) });
  const diagnoses = normalizeDashboardDiagnoses(query.data ?? [], config.showRuledOutDiagnoses !== false);
  useReport(props, query.isLoading, query.error, diagnoses.length);
  const translatedLabel = (type: "CERTAINTY" | "ORDER" | "STATUS", value?: string) => value
    ? String(t(`CLINICAL_DIAGNOSIS_${type}_${value.toUpperCase().replaceAll(" ", "_")}`, { defaultValue: value }))
    : "";
  if (config.legacyIpdColumns === true) return <QueryFrame loading={query.isLoading} error={query.error} empty={!diagnoses.length} retry={() => void query.refetch()}>
    <div className="ipd-legacy-table-scroll"><table className="ipd-legacy-table ipd-diagnosis-table">
      <thead><tr><th>Diagnóstico</th><th>Orden</th><th>Certeza</th><th>Estado</th><th>Diagnosticado por</th><th>Fecha</th></tr></thead>
      <tbody>{diagnoses.map((diagnosis) => <tr className={diagnosis.ruledOut ? "ruled-out" : undefined} key={diagnosis.key}>
        <td><strong>{diagnosis.name}</strong>{diagnosis.comments && <small>{diagnosis.comments}</small>}</td>
        <td>{translatedLabel("ORDER", diagnosis.order) || "—"}</td>
        <td>{translatedLabel("CERTAINTY", diagnosis.certainty) || "—"}</td>
        <td>{translatedLabel("STATUS", diagnosis.status) || "—"}</td>
        <td>{diagnosis.provider || "—"}</td>
        <td>{diagnosis.date !== undefined ? dateOf(diagnosis.date, props.context.locale, props.context.timeZone) : "—"}</td>
      </tr>)}</tbody>
    </table></div>
  </QueryFrame>;
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!diagnoses.length} retry={() => void query.refetch()}>
    <div className={`dashboard-diagnoses${config.compact === true ? " compact" : ""}`}>{diagnoses.map((diagnosis) => <article className={diagnosis.ruledOut ? "ruled-out" : ""} key={diagnosis.key}>
      <div className="dashboard-diagnosis-main"><span><strong>{diagnosis.name}</strong>{config.hideVisitDate !== true && diagnosis.date !== undefined && <small>{dateOf(diagnosis.date, props.context.locale, props.context.timeZone)}</small>}</span><span className="dashboard-diagnosis-labels">{config.showCertainty !== false && diagnosis.certainty && <span>{translatedLabel("CERTAINTY", diagnosis.certainty)}</span>}{config.showOrder !== false && diagnosis.order && <span>{translatedLabel("ORDER", diagnosis.order)}</span>}{diagnosis.status && <span>{translatedLabel("STATUS", diagnosis.status)}</span>}</span></div>
      {diagnosis.comments && <div className="dashboard-diagnosis-comments"><i className="pi pi-comments" /><span>{diagnosis.comments}</span>{diagnosis.provider && <small>{diagnosis.provider}</small>}</div>}
      {!diagnosis.comments && config.showDetailsButton === true && diagnosis.provider && <details><summary>Ver detalles</summary><small>Registrado por {diagnosis.provider}</small></details>}
    </article>)}</div>
  </QueryFrame>;
}
const ConditionControl = (props: DashboardControlProps) => <RecordsControl {...props} kind="condition" />;
function ProgramDashboardControl(props: DashboardControlProps) {
  const query = useQuery({ queryKey: ["clinical-dashboard", "program", props.context.patient.uuid], queryFn: () => getPatientPrograms(props.context.patient.uuid) });
  const programs = normalizeDashboardPrograms(query.data ?? []);
  useReport(props, query.isLoading, query.error, programs.length);
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!programs.length} retry={() => void query.refetch()}>
    <div className="dashboard-programs">{programs.map((program) => <article key={program.uuid}>
      <header><strong>{program.name}</strong><span>{program.active ? "Tratamiento activo" : "Tratamiento inactivo"}</span></header>
      <dl className="clinical-details"><div><dt>Inicio</dt><dd>{dateOf(program.dateEnrolled, props.context.locale, props.context.timeZone)}</dd></div>{program.dateCompleted !== undefined && <div><dt>Fin</dt><dd>{dateOf(program.dateCompleted, props.context.locale, props.context.timeZone)}</dd></div>}{program.outcome && <div><dt>Resultado</dt><dd>{program.outcome}</dd></div>}{program.location && <div><dt>Centro de enrolamiento</dt><dd>{program.location}</dd></div>}{program.attributes.map((attribute) => <div key={attribute.name}><dt>{attribute.name}</dt><dd>{attribute.value}</dd></div>)}</dl>
      {program.states.length > 0 && <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Estado de tratamiento</th><th>Inicio</th><th>Fin</th></tr></thead><tbody>{program.states.map((state, index) => <tr key={`${state.name}-${index}`}><td>{state.name}</td><td>{dateOf(state.startDate, props.context.locale, props.context.timeZone)}</td><td>{dateOf(state.endDate, props.context.locale, props.context.timeZone)}</td></tr>)}</tbody></table></div>}
    </article>)}</div>
  </QueryFrame>;
}

function ProgramHeaderAction({ context }: Pick<DashboardControlProps, "section" | "context">) {
  return <a className="p-button p-component p-button-text p-button-rounded" aria-label="Abrir gestión de programas" href={`/bahmni/clinical/index.html#/default/patient/${encodeURIComponent(context.patient.uuid)}/consultationContext`}><i className="pi pi-external-link" /></a>;
}

function observationDate(item: ClinicalRecord): number {
  const raw = item.observationDateTime ?? item.obsDatetime ?? item.encounterDateTime;
  const time = typeof raw === "number" ? raw : typeof raw === "string" ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function ObservationGraph({ records, referenceLines = [], birthDate, useAgeAxis }: { records: ClinicalRecord[]; referenceLines?: GraphReferenceLine[]; birthDate?: string; useAgeAxis: boolean }) {
  const patientPoints = records.flatMap((item) => {
    const value = typeof item.value === "number" ? item.value : Number(item.value);
    const label = valueOf(asRecord(item.concept).shortName ?? asRecord(item.concept).name ?? item.conceptName);
    const date = item.observationDateTime ?? item.obsDatetime ?? item.encounterDateTime;
    const x = useAgeAxis && birthDate && (typeof date === "string" || typeof date === "number") ? differenceInMonths(birthDate, date) : observationDate(item);
    return Number.isFinite(value) ? [{ x, y: value, label, reference: false }] : [];
  });
  const points = [...patientPoints, ...referenceLines.flatMap((line) => line.points)].sort((a, b) => a.x - b.x);
  if (points.length < 2) return <p className="muted-text">Se requieren al menos dos resultados numéricos para graficar.</p>;
  const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
  const x = (value: number) => 10 + ((value - minX) / Math.max(maxX - minX, 1)) * 580;
  const y = (value: number) => 190 - ((value - minY) / Math.max(maxY - minY, 1)) * 180;
  const grouped = new Map<string, typeof points>();
  points.forEach((point) => grouped.set(point.label, [...(grouped.get(point.label) ?? []), point]));
  const groups = [...grouped.entries()];
  const colors = ["#006a88", "#c2410c", "#6d28d9", "#15803d", "#be123c"];
  return <div><svg className="dashboard-observation-chart" viewBox="0 0 600 210" role="img" aria-label="Tendencia de observaciones">{groups.map(([label, group], groupIndex) => {
    const values = group;
    const color = colors[groupIndex % colors.length];
    const reference = values.every((point) => point.reference);
    return <g key={label}><polyline points={values.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")} fill="none" stroke={color} strokeWidth={reference ? 1.5 : 3} strokeDasharray={reference ? "5 4" : undefined} />{!reference && values.map((point, index) => <circle key={`${point.x}-${index}`} cx={x(point.x)} cy={y(point.y)} r="4" style={{ color }}><title>{point.label}: {point.y}</title></circle>)}</g>;
  })}</svg><div className="dashboard-chart-axis">{useAgeAxis ? "Edad (meses)" : "Fecha de observación"}</div><div className="dashboard-chart-legend">{groups.map(([label, values], index) => <span key={label}><i className={values.every((point) => point.reference) ? "reference" : ""} style={{ background: colors[index % colors.length] }} />{label}</span>)}</div></div>;
}

function ObservationControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const conceptNames = [...arrayConfig(config, "conceptNames"), ...arrayConfig(config, "obsConcepts"), ...arrayConfig(config, "yAxisConcepts")];
  const query = useQuery({ queryKey: ["clinical-dashboard", "observations", props.context.patient.uuid, props.context.visit?.uuid, props.section.id, props.expanded, conceptNames, config.scope, config.numberOfVisits], queryFn: () => getPatientObservations({ patientUuid: props.context.patient.uuid, conceptNames, numberOfVisits: config.numberOfVisits as number | string | undefined, scope: typeof config.scope === "string" ? config.scope : undefined, obsIgnoreList: arrayConfig(config, "obsIgnoreList") }) });
  const referenceFile = props.section.type === "observationGraph" && typeof config.referenceData === "string" ? config.referenceData : undefined;
  const referenceQuery = useQuery({
    queryKey: ["clinical-dashboard", "observation-reference", referenceFile, props.context.patient.gender, props.context.patient.birthDate],
    enabled: Boolean(referenceFile && props.context.patient.birthDate),
    queryFn: async () => parseObservationGraphReference(await loadAppTextAsset("clinical", referenceFile!), props.context.patient.gender, differenceInMonths(props.context.patient.birthDate!)),
  });
  const data = query.data ?? [];
  const loading = query.isLoading || (Boolean(referenceFile) && referenceQuery.isLoading);
  const error = query.error ?? referenceQuery.error;
  useReport(props, loading, error, data.length);
  return <QueryFrame loading={loading} error={error} empty={!data.length} retry={() => { void query.refetch(); if (referenceFile) void referenceQuery.refetch(); }}>{props.section.type === "observationGraph" ? <ObservationGraph records={data} referenceLines={referenceQuery.data} birthDate={props.context.patient.birthDate} useAgeAxis={Boolean(referenceFile)} /> : <RecordTable records={data} locale={props.context.locale} timeZone={props.context.timeZone} displayNameType={config.displayNameType} showDetailsButton={config.showDetailsButton === true} />}</QueryFrame>;
}

function PivotTableControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const query = useQuery({
    queryKey: ["clinical-dashboard", "pivot", props.context.patient.uuid, props.section.id, props.expanded, config],
    queryFn: () => getDiseaseSummaryData({ patientUuid: props.context.patient.uuid, config }),
  });
  const root = asRecord(query.data);
  const concepts: Record<string, unknown>[] = asRecords(root.conceptDetails).map((concept) => ({
    ...concept,
    fullName: valueOf(concept.fullName ?? concept.name),
    shortName: valueOf(concept.name ?? concept.fullName),
  }));
  const configuredOrder = arrayConfig(config, "obsConcepts");
  concepts.sort((left, right) => {
    const leftIndex = configuredOrder.indexOf(String(left.fullName));
    const rightIndex = configuredOrder.indexOf(String(right.fullName));
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const rows = Object.entries(asRecord(root.tabularData)).sort(([left], [right]) => left.localeCompare(right));
  useReport(props, query.isLoading, query.error, rows.length);
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!rows.length} retry={() => void query.refetch()}>
    <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>{valueOf(config.rowHeading ?? config.groupBy ?? "Fecha")}</th>{concepts.map((concept) => <th key={String(concept.fullName)}>{String(concept.shortName)}{concept.units ? <small>{valueOf(concept.units)}</small> : null}</th>)}</tr></thead><tbody>{rows.map(([date, rawColumns]) => {
      const columns = asRecord(rawColumns);
      return <tr key={date}><th>{dateOf(date, props.context.locale, props.context.timeZone)}</th>{concepts.map((concept) => {
        const cell = asRecord(columns[String(concept.shortName)] ?? columns[String(concept.fullName)]);
        const rawValue = cell.valueAsString ?? cell.value;
        const numericValue = Number(rawValue);
        const low = Number(cell.lowNormal ?? concept.lowNormal);
        const high = Number(cell.hiNormal ?? concept.hiNormal);
        const abnormal = cell.abnormal === true || (Number.isFinite(numericValue) && ((Number.isFinite(low) && numericValue < low) || (Number.isFinite(high) && numericValue > high)));
        return <td className={abnormal ? "abnormal" : ""} key={String(concept.fullName)} title={valueOf(rawValue)}>{valueOf(rawValue)}</td>;
      })}</tr>;
    })}</tbody></table></div>
  </QueryFrame>;
}

function observationCellValue(values: unknown, locale: string, timeZone: string): string {
  const observations = asRecords(values);
  return observations.map((observation) => {
    const concept = asRecord(observation.concept);
    const value = observation.valueAsString ?? observation.value;
    if (concept.dataType === "Boolean" && typeof value === "boolean") return value ? "Sí" : "No";
    if (concept.dataType === "Date") return dateOf(observation.observationDateTime ?? value, locale, timeZone);
    return valueOf(value);
  }).filter((value) => value !== "—").join(", ") || "—";
}

function ObsToObsFlowSheetControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const query = useQuery({
    queryKey: ["clinical-dashboard", "obs-flow-sheet", props.context.patient.uuid, props.context.enrollmentUuid, props.section.id, props.expanded, config],
    queryFn: () => getObservationFlowSheet({ patientUuid: props.context.patient.uuid, patientProgramUuid: props.context.enrollmentUuid, config }),
  });
  const root = asRecord(query.data);
  const rows = asRecords(root.rows);
  const groupBy = typeof config.groupByConcept === "string" ? config.groupByConcept : undefined;
  let headers = asRecords(root.headers);
  if (config.hideEmptyRecords === true) headers = headers.filter((header) => rows.some((row) => asRecords(asRecord(row.columns)[String(header.name)]).length > 0));
  if (groupBy) headers = [...headers].sort((left, right) => left.name === groupBy ? -1 : right.name === groupBy ? 1 : 0);
  useReport(props, query.isLoading, query.error, rows.length);
  const headerName = (header: Record<string, unknown>) => `${valueOf(header.shortName ?? header.name)}${header.units ? ` (${valueOf(header.units)})` : ""}`;
  const renderCell = (row: Record<string, unknown>, header: Record<string, unknown>, key: string) => {
    const values = asRecords(asRecord(row.columns)[String(header.name)]);
    const abnormal = values.some((item) => item.abnormal === true);
    const hasImages = values.some((item) => asRecord(item.concept).conceptClass === "Image");
    return <td className={abnormal ? "abnormal" : ""} key={key}>{hasImages ? values.map((item, index) => {
      const path = valueOf(item.value);
      return path.toLowerCase().endsWith(".pdf") ? <a key={index} href={`/document_images/${encodeURI(path)}`} target="_blank" rel="noreferrer">PDF</a> : <a key={index} href={`/document_images/${encodeURI(path)}`} target="_blank" rel="noreferrer">Ver imagen</a>;
    }) : observationCellValue(values, props.context.locale, props.context.timeZone)}</td>;
  };
  const pivotOnColumn = config.pivotOn === "column";
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!rows.length} retry={() => void query.refetch()}>
    <div className="dashboard-matrix-scroll"><table className="dashboard-matrix">{pivotOnColumn ? <tbody>{headers.map((header) => <tr key={String(header.name)}><th>{headerName(header)}</th>{rows.map((row, index) => renderCell(row, header, `${String(header.name)}-${index}`))}</tr>)}</tbody> : <><thead><tr>{headers.map((header) => <th key={String(header.name)}>{headerName(header)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={String(row.uuid ?? rowIndex)}>{headers.map((header) => renderCell(row, header, `${rowIndex}-${String(header.name)}`))}</tr>)}</tbody></>}</table></div>
  </QueryFrame>;
}

function DispositionControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const query = useQuery({ queryKey: ["clinical-dashboard", "dispositions", props.context.patient.uuid, config.numberOfVisits, props.context.locale], queryFn: () => getDispositions({ patientUuid: props.context.patient.uuid, numberOfVisits: config.numberOfVisits as number | string | undefined, locale: props.context.locale }) });
  const data = (query.data ?? []).map((item) => ({ uuid: item.uuid, provider: item.provider, creatorName: item.creatorName, display: valueOf(item.preferredName ?? item.conceptName), notes: valueOf(asRecords(item.additionalObs)[0]?.value), date: item.dispositionDateTime }));
  useReport(props, query.isLoading, query.error, data.length);
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!data.length} retry={() => void query.refetch()}><div className="dashboard-dispositions">{data.map((item, index) => <article key={String(item.uuid ?? index)}><div><strong>{item.display}</strong><time>{dateOf(item.date, props.context.locale, props.context.timeZone)}</time></div>{item.notes !== "—" ? <div className="dashboard-record-comment"><i className="pi pi-comment" /><pre>{item.notes}</pre><small>{valueOf(item.provider ?? item.creatorName)}</small></div> : config.showDetailsButton === true && <details><summary>Ver detalles</summary><small>{valueOf(item.provider ?? item.creatorName)}</small></details>}</article>)}</div></QueryFrame>;
}

function OrdersControl(props: DashboardControlProps) {
  const { t } = useTranslation();
  // Legacy passes only dashboardConfig to the compact control and switches to
  // expandedViewConfig in the details dialog. Top-level section metadata (for
  // example orderType and displayOrder) is not observation-rendering config.
  const config: JsonObject = {
    ...props.section.dashboardConfig,
    ...(props.expanded ? props.section.expandedViewConfig : {}),
    ...(typeof props.section.raw.showDetailsButton === "boolean" ? { showDetailsButton: props.section.raw.showDetailsButton } : {}),
  };
  const configuredType = typeof props.section.raw.orderType === "string" ? props.section.raw.orderType : props.section.type === "radiology" || props.section.type === "pacsOrders" ? "Radiology Order" : undefined;
  const types = useQuery({ queryKey: ["clinical-dashboard", "order-types"], queryFn: getOrderTypes });
  const orderTypeUuid = types.data?.find((type) => (type.display ?? type.name)?.toLocaleLowerCase() === configuredType?.toLocaleLowerCase())?.uuid;
  const query = useQuery({ queryKey: ["clinical-dashboard", "orders", props.context.patient.uuid, props.section.id, orderTypeUuid, config.numberOfVisits], enabled: !configuredType || Boolean(orderTypeUuid), queryFn: () => getDashboardOrders({ patientUuid: props.context.patient.uuid, orderTypeUuid, conceptNames: arrayConfig(config, "conceptNames"), obsIgnoreList: arrayConfig(config, "obsIgnoreList"), numberOfVisits: config.numberOfVisits as number | string | undefined, includeObs: true }) });
  const data = query.data ?? [];
  const orders = normalizeOrderFulfillmentRecords(data, props.context.locale);
  const missingOrderType = Boolean(configuredType && types.isSuccess && !orderTypeUuid);
  const error = types.error ?? query.error ?? (missingOrderType ? new Error(`OpenMRS no publicó el tipo de orden configurado: ${configuredType}`) : null);
  useReport(props, types.isLoading || query.isLoading, error, data.length);
  const openPacs = (order: DashboardRecord) => {
    const template = typeof config.pacsImageUrl === "string" ? config.pacsImageUrl : undefined;
    if (!template) return;
    const url = template.replace("{{patientID}}", encodeURIComponent(props.context.patient.identifier)).replace("{{orderNumber}}", encodeURIComponent(valueOf(order.orderNumber)));
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const showHeader = config.showHeader !== false;
  const noFulfillmentMessage = t("NO_FULFILMENT_MESSAGE", { defaultValue: "No se han captado observaciones de esta orden" });
  return <QueryFrame loading={types.isLoading || query.isLoading} error={error} empty={!orders.length} retry={() => { void types.refetch(); void query.refetch(); }}>
    {showHeader ? <div className="dashboard-order-fulfillment">
      {orders.map((order, index) => <details open={index === 0} key={order.id}>
        <summary>
          <span className="dashboard-order-title"><strong>{order.label}</strong></span>
          <span className="dashboard-order-meta">{order.provider && <span>{order.provider}</span>}{order.orderDate !== undefined && <time>{dateOf(order.orderDate, props.context.locale, props.context.timeZone)}</time>}{order.hasObservations && <i className="pi pi-list-check" role="img" aria-label="Orden con observaciones" />}</span>
        </summary>
        <div className="dashboard-order-observations">
          {order.observations.length > 0
            ? <RecordTable records={order.observations} locale={props.context.locale} timeZone={props.context.timeZone} displayNameType={config.displayNameType} showDetailsButton={config.showDetailsButton === true} />
            : <p className="dashboard-order-empty">{noFulfillmentMessage}</p>}
        </div>
      </details>)}
    </div> : <div className="dashboard-order-fulfillment dashboard-order-fulfillment--without-header">
      {orders.filter((order) => order.observations.length > 0).map((order) => <RecordTable key={order.id} records={order.observations} locale={props.context.locale} timeZone={props.context.timeZone} displayNameType={config.displayNameType} showDetailsButton={config.showDetailsButton === true} />)}
    </div>}
    {props.section.type === "pacsOrders" && data.map((order, index) => <Button key={String(order.orderUuid ?? index)} text label={`Abrir estudio ${valueOf(order.orderNumber)}`} icon="pi pi-external-link" onClick={() => openPacs(order)} />)}
  </QueryFrame>;
}

function RadiologyDocumentsControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const encounterConfig = useQuery({ queryKey: ["encounter-config"], queryFn: getEncounterConfiguration });
  const radiologyTypeUuid = encounterConfig.data?.encounterTypes.RADIOLOGY;
  const query = useQuery({ queryKey: ["clinical-dashboard", "radiology-documents", props.context.patient.uuid, radiologyTypeUuid], enabled: Boolean(radiologyTypeUuid), queryFn: () => getEncountersForEncounterType(props.context.patient.uuid, radiologyTypeUuid!) });
  const visitUuids = Array.isArray(config.visitUuids) ? config.visitUuids.filter((value): value is string => typeof value === "string") : undefined;
  const groups = mapRadiologyDocuments(query.data ?? [], visitUuids);
  const error = encounterConfig.error ?? query.error;
  const loading = encounterConfig.isLoading || query.isLoading;
  useReport(props, loading, error, groups.length);
  return <QueryFrame loading={loading} error={error} empty={!groups.length} retry={() => { void encounterConfig.refetch(); void query.refetch(); }}><div className="radiology-document-groups">{groups.map((group) => <details open key={group.conceptName}><summary>{group.conceptName} <span>({group.documents.length})</span></summary><div className="radiology-document-grid">{group.documents.map((document) => { const href = `/document_images/${encodeURI(document.value)}`; const pdf = document.value.toLocaleLowerCase().endsWith(".pdf"); return <a href={href} target="_blank" rel="noreferrer" key={document.id}>{pdf ? <i className="pi pi-file-pdf" /> : <Image unoptimized src={href} width={52} height={52} alt="" />}<span><strong>{pdf ? "Abrir informe PDF" : "Abrir imagen"}</strong><small>{dateOf(document.date, props.context.locale, props.context.timeZone)}{document.visitActive ? " · visita activa" : ""}</small>{document.comment && <small>{document.comment}</small>}</span></a>; })}</div></details>)}</div></QueryFrame>;
}

function IpdTreatmentTable({ sections, locale, timeZone, context, config, onUpdated }: {
  sections: TreatmentSection[];
  locale: string;
  timeZone: string;
  context: DashboardControlProps["context"];
  config: JsonObject;
  onUpdated(): void | Promise<unknown>;
}) {
  const orders = sections.flatMap((section) => section.orders);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(orders.map((order) => order.uuid)));
  const [selected, setSelected] = useState<{ order: DrugOrderRow; action: TreatmentScheduleAction }>();
  const scheduleSource = asRecord(config.ipdScheduleConfig);
  const scheduleConfig: TreatmentScheduleConfig = {
    enable24HourTimers: scheduleSource.enable24HourTimers === true,
    drugChartStartTimeFrequencies: Array.isArray(scheduleSource.drugChartStartTimeFrequencies) ? scheduleSource.drugChartStartTimeFrequencies.filter((value): value is string => typeof value === "string") : [],
    drugChartScheduleFrequencies: Array.isArray(scheduleSource.drugChartScheduleFrequencies) ? scheduleSource.drugChartScheduleFrequencies.flatMap((value) => {
      const item = asRecord(value);
      const name = typeof item.name === "string" ? item.name : undefined;
      const frequencyPerDay = Number(item.frequencyPerDay);
      const scheduleTiming = Array.isArray(item.scheduleTiming) ? item.scheduleTiming.filter((entry): entry is string => typeof entry === "string") : [];
      return name && Number.isInteger(frequencyPerDay) && frequencyPerDay > 0 ? [{ name, frequencyPerDay, scheduleTiming }] : [];
    }) : [],
    timeInMinutesToDisableSlotPostScheduledTime: Number(scheduleSource.timeInMinutesToDisableSlotPostScheduledTime) || 60,
  };
  const canEditSchedules = context.privilegeNames.has("Edit Medication Tasks");
  const prnOrderUuids = orders.filter((order) => order.asNeeded && !order.stopDate).map((order) => order.uuid);
  const prnSchedules = useQuery({
    queryKey: ["ipd", "treatments", "prn-schedules", context.patient.uuid, prnOrderUuids.join(",")],
    queryFn: () => getPrnScheduledOrderUuids(context.patient.uuid, prnOrderUuids),
    enabled: canEditSchedules && prnOrderUuids.length > 0,
  });
  const visitSummary = asRecord(context.visitSummary);
  const admitted = Object.keys(asRecord(visitSummary.admissionDetails)).length > 0;
  const readOnly = Boolean(context.visit?.stopDatetime ?? visitSummary.stopDateTime ?? visitSummary.stopDatetime);
  const toggle = (uuid: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
    return next;
  });
  const medicationTag = (order: DrugOrderRow) => order.emergency ? "EMERG" : order.immediately ? "Rx-STAT" : order.asNeeded ? "Rx-PRN" : "Rx";
  const status = (order: DrugOrderRow) => {
    if (order.status === "stopped") return { label: "Detenido", className: "stopped" };
    if (order.status === "completed") return { label: "Completado", className: "completed" };
    if (order.status === "in-progress") return { label: "En curso", className: "in-progress" };
    return { label: "—", className: "empty" };
  };
  return <div className="ipd-treatment-table-scroll">
    <table className="ipd-treatment-table">
      <thead><tr><th aria-label="Expandir" /><th>Inicio</th><th>Medicamento</th><th>Posología</th><th>Estado</th><th>Profesional</th><th>Acciones</th></tr></thead>
      <tbody>{orders.map((order) => {
        const isExpanded = expanded.has(order.uuid);
        const orderStatus = status(order);
        const dosage = [order.dose, order.route, order.frequency, order.duration ? `por ${order.duration}` : undefined].filter((value) => value && value !== "—").join(" · ") || "—";
        return <Fragment key={order.uuid}>
          <tr className={order.status === "stopped" ? "stopped" : ""}>
            <td className="ipd-treatment-expand"><button type="button" aria-label={isExpanded ? `Ocultar detalles de ${order.name}` : `Mostrar detalles de ${order.name}`} aria-expanded={isExpanded} onClick={() => toggle(order.uuid)}><i className={`pi ${isExpanded ? "pi-chevron-up" : "pi-chevron-down"}`} /></button></td>
            <td><time>{dateOnlyOf(order.startDate, locale, timeZone)}</time></td>
            <td><span className="ipd-treatment-drug"><strong>{order.name}</strong><small>{medicationTag(order)}</small></span></td>
            <td>{dosage}</td>
            <td><span className={`ipd-treatment-status ${orderStatus.className}`}>{orderStatus.label}</span></td>
            <td>{order.provider}</td>
            <td className="ipd-treatment-actions">{(() => {
              const action = resolveTreatmentScheduleAction(order, { hasPrivilege: canEditSchedules, readOnly, admitted, prnScheduled: prnSchedules.data?.has(order.uuid) });
              return action ? <button type="button" className="ipd-treatment-action" disabled={action.disabled} title={action.disabledReason} onClick={() => setSelected({ order, action })}>{action.label}</button> : "—";
            })()}</td>
          </tr>
          {isExpanded && <tr className="ipd-treatment-detail-row"><td /><td colSpan={6}><div className="ipd-treatment-detail">
            {order.instructions && <dl><dt>Indicaciones</dt><dd>{order.instructions}</dd></dl>}
            {order.additionalInstructions && <dl><dt>Indicaciones adicionales</dt><dd>{order.additionalInstructions}</dd></dl>}
            {order.stopReason && <dl><dt>Motivo de suspensión</dt><dd>{order.stopReason}</dd></dl>}
            {!order.instructions && !order.additionalInstructions && !order.stopReason && <span className="muted-text">Sin indicaciones adicionales.</span>}
            <small>{[order.provider !== "—" ? order.provider : undefined, order.recordedDateTime !== undefined ? dateOf(order.recordedDateTime, locale, timeZone) : undefined].filter(Boolean).join(" · ")}</small>
          </div></td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
    {selected && <IpdTreatmentScheduleDialog
      patientUuid={context.patient.uuid}
      visitUuid={context.visit?.uuid}
      locationUuid={context.location?.uuid}
      currentProvider={context.provider}
      order={selected.order}
      action={selected.action}
      config={scheduleConfig}
      onHide={() => setSelected(undefined)}
      onSaved={async () => {
        await onUpdated();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["ipd", "patient-dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["ipd", "care-view", "tasks"] }),
          prnSchedules.refetch(),
        ]);
      }}
    />}
  </div>;
}

function TreatmentList({ sections, config, locale, timeZone, context, onUpdated, onPrint, onEmail, busy }: { sections: TreatmentSection[]; config: JsonObject; locale: string; timeZone: string; context: DashboardControlProps["context"]; onUpdated(): void | Promise<unknown>; onPrint?(section: TreatmentSection): void; onEmail?(section: TreatmentSection): void; busy?: string }) {
  if (config.legacyIpd === true) return <IpdTreatmentTable sections={sections} locale={locale} timeZone={timeZone} context={context} config={config} onUpdated={onUpdated} />;
  const showRoute = config.showRoute === true;
  const showDrugForm = config.showDrugForm === true;
  const showDetails = config.showDetailsButton === true;
  return <div className="dashboard-treatment-sections">{sections.map((section) => <section key={section.id}>
    <header><strong>{section.otherActive ? section.label : `Visita del ${dateOf(section.date, locale, timeZone)}`}</strong>{config.legacyIpd !== true && !section.otherActive && <span className="dashboard-inline-actions"><Button text rounded icon="pi pi-download" aria-label="Descargar receta" loading={busy === `print-${section.id}`} onClick={() => onPrint?.(section)} /><Button text rounded icon="pi pi-envelope" aria-label="Enviar receta por correo" loading={busy === `email-${section.id}`} onClick={() => onEmail?.(section)} /></span>}</header>
    {section.orders.map((order) => <article className={order.active ? "active" : "stopped"} key={order.uuid}>
      <div className="dashboard-treatment-main"><span><strong>{order.name}{showDrugForm && order.drugForm ? ` (${order.drugForm})` : ""}</strong><small>{[order.dose, showRoute ? order.route : undefined, order.frequency, order.duration].filter(Boolean).join(" · ")}</small></span><time>{dateOf(order.startDate, locale, timeZone)}</time></div>
      {order.stopDate !== undefined && <small>Detenido el {dateOf(order.stopDate, locale, timeZone)}</small>}
      {(order.additionalInstructions || showDetails) && <details open={Boolean(order.additionalInstructions)}><summary>Detalles</summary>{order.instructions && <p>{order.instructions}</p>}{order.additionalInstructions && <p>{order.additionalInstructions}</p>}<small>{order.provider}</small></details>}
    </article>)}
  </section>)}</div>;
}

const dayStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
function activeOnDate(order: DrugOrderRow, date: Date): boolean {
  const start = order.startDate ? dayStart(new Date(order.startDate)) : undefined;
  const stop = order.stopDate ? dayStart(new Date(order.stopDate)) : undefined;
  return Boolean(start && !Number.isNaN(start.getTime()) && start <= date && (!stop || Number.isNaN(stop.getTime()) || stop >= date));
}

function TreatmentFlowSheet({ sections, visitStart, visitStop, locale }: { sections: TreatmentSection[]; visitStart?: string | number; visitStop?: string | number; locale: string }) {
  const orders = sections.filter((section) => !section.otherActive).flatMap((section) => section.orders);
  if (!orders.length || !visitStart) return null;
  const first = dayStart(new Date(visitStart));
  const last = dayStart(visitStop ? new Date(visitStop) : new Date());
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return null;
  const days: Date[] = [];
  for (let date = first; date <= last && days.length < 366; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)) {
    if (orders.some((order) => activeOnDate(order, date))) days.push(date);
  }
  if (!days.length) return null;
  return <section className="dashboard-treatment-flow"><h3>Cuadro de tratamientos</h3><div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Fecha</th>{orders.map((order) => <th key={order.uuid}>{order.name}</th>)}</tr></thead><tbody>{days.map((date) => <tr key={date.toISOString()}><th>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)}</th>{orders.map((order) => <td key={order.uuid}>{activeOnDate(order, date) ? <i className="pi pi-check" aria-label="Activo" /> : "—"}</td>)}</tr>)}</tbody></table></div></section>;
}

function DrugControl(props: DashboardControlProps) {
  const [shareBusy, setShareBusy] = useState<string>();
  const [shareMessage, setShareMessage] = useState<{ error: boolean; text: string }>();
  const config = activeConfig(props);
  const regimen = props.section.type === "chronicTreatmentChart";
  const treatment = props.section.type === "treatment";
  const query = useQuery({ queryKey: ["clinical-dashboard", regimen ? "regimen" : "drug-orders", props.context.patient.uuid, props.context.enrollmentUuid, props.section.id, config], queryFn: async () => {
    if (regimen) return { regimen: asRecord(await getDrugRegimen({ patientUuid: props.context.patient.uuid, patientProgramUuid: props.context.enrollmentUuid, drugs: arrayConfig(config, "drugs") })), orders: [] as DashboardRecord[], treatmentResponse: {} as DashboardRecord };
    if (treatment) {
      const response = config.legacyIpd === true && props.context.visit?.uuid
        ? await getIpdVisitMedications(props.context.visit.uuid)
        : await getPrescribedAndActiveDrugOrders({
          patientUuid: props.context.patient.uuid,
          numberOfVisits: config.numberOfVisits as number | string | undefined,
          showOtherActive: config.showOtherActive === true,
          visitUuids: Array.isArray(config.visitUuids) ? config.visitUuids.filter((value): value is string => typeof value === "string") : undefined,
          preferredLocale: props.context.locale,
        });
      return { regimen: {} as DashboardRecord, orders: [] as DashboardRecord[], treatmentResponse: response };
    }
    const orders = await getDrugOrderDetails({ patientUuid: props.context.patient.uuid, patientProgramUuid: props.context.enrollmentUuid, includeConceptSet: typeof config.drugConceptSet === "string" ? config.drugConceptSet : typeof config.includeConceptSet === "string" ? config.includeConceptSet : undefined, excludeConceptSet: typeof config.excludeConceptSet === "string" ? config.excludeConceptSet : undefined, active: typeof config.active === "boolean" ? config.active : undefined });
    return { regimen: {} as DashboardRecord, orders, treatmentResponse: {} as DashboardRecord };
  } });
  const regimenRoot = query.data?.regimen ?? {};
  const headers = asRecords(regimenRoot.headers);
  let regimenRows = asRecords(regimenRoot.rows).filter((row) => Object.values(asRecord(row.drugs)).some((value) => value !== undefined && value !== null && value !== ""));
  if (props.section.raw.dateSort === "desc") regimenRows = [...regimenRows].reverse();
  const orders = normalizeDrugOrders(query.data?.orders ?? [], config.showOnlyActive === true);
  const treatmentSections = treatment ? normalizeTreatmentSections(
    query.data?.treatmentResponse ?? {},
    config.showOnlyActive === true,
    config.legacyIpd === true,
    config.legacyIpd === true ? props.context.visit?.uuid : undefined,
  ) : [];
  const count = regimen ? regimenRows.length : treatment ? treatmentSections.reduce((total, section) => total + section.orders.length, 0) : orders.length;
  useReport(props, query.isLoading, query.error, count);
  if (treatment) {
    const admitted = Object.keys(asRecord(asRecord(props.context.visitSummary).admissionDetails)).length > 0;
    const visitSummary = asRecord(props.context.visitSummary);
    const visitStart = (props.context.visit?.startDatetime ?? visitSummary.startDateTime) as string | number | undefined;
    const visitStop = (props.context.visit?.stopDatetime ?? visitSummary.stopDateTime) as string | number | undefined;
    const institution = props.context.location?.display ?? props.context.location?.name ?? "HCSBA";
    const patientEmail = props.context.patient.attributes.find((attribute) => ["email", "correo"].some((term) => attribute.label.toLocaleLowerCase(props.context.locale).includes(term)))?.value;
    const prescription = (section: TreatmentSection) => treatmentDocument(section, props.context.patient, institution, props.context.locale);
    const printSection = async (section: TreatmentSection) => { setShareBusy(`print-${section.id}`); setShareMessage(undefined); try { const blob = await renderTreatmentPdf(prescription(section), "blob") as Blob; const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch { setShareMessage({ error: true, text: "No fue posible generar la receta." }); } finally { setShareBusy(undefined); } };
    const emailSection = async (section: TreatmentSection) => { if (!patientEmail) { setShareMessage({ error: true, text: "El paciente no tiene un correo registrado." }); return; } setShareBusy(`email-${section.id}`); setShareMessage(undefined); try { const data = await renderTreatmentPdf(prescription(section), "base64") as string; const visitDate = dateOf(section.date, props.context.locale, props.context.timeZone); await sendPatientEmail(props.context.patient.uuid, { mailAttachments: [{ contentType: "application/pdf", name: `Receta_${props.context.patient.identifier}_${visitDate.replaceAll("/", "-")}.pdf`, data }], subject: `Receta médica · ${institution} · ${visitDate}`, body: `Estimado/a ${props.context.patient.name}:\n\nAdjuntamos la receta de su consulta del ${visitDate}.\n\nAtentamente,\n${institution}` }); setShareMessage({ error: false, text: "Receta enviada por correo." }); } catch { setShareMessage({ error: true, text: "No fue posible enviar la receta." }); } finally { setShareBusy(undefined); } };
    const treatmentContent = <>{config.showListView !== false && <TreatmentList sections={treatmentSections} config={config} locale={props.context.locale} timeZone={props.context.timeZone} context={props.context} onUpdated={() => query.refetch()} onPrint={(section) => void printSection(section)} onEmail={(section) => void emailSection(section)} busy={shareBusy} />}{config.showFlowSheet === true && admitted && <TreatmentFlowSheet sections={treatmentSections} visitStart={visitStart} visitStop={visitStop} locale={props.context.locale} />}</>;
    return <QueryFrame loading={query.isLoading} error={query.error} empty={!count} retry={() => void query.refetch()}>{shareMessage && <p role={shareMessage.error ? "alert" : "status"} className={shareMessage.error ? "error-banner" : "success-banner"}>{shareMessage.text}</p>}{treatmentContent}{config.legacyIpd !== true && <><Button outlined icon="pi pi-print" label="Imprimir todo" onClick={() => window.print()} /><section className="print-sheet"><h1>{valueOf(props.section.raw.title ?? props.section.translationKey ?? "Tratamientos")}</h1><dl><dt>Paciente</dt><dd>{props.context.patient.name}</dd><dt>Identificador</dt><dd>{props.context.patient.identifier}</dd></dl>{treatmentContent}</section></>}</QueryFrame>;
  }
  const table = regimen ? <div className="dashboard-matrix-scroll"><table className="dashboard-matrix chronic-treatment-table"><thead><tr>{regimenRows.some((row) => row.month) && <th>Mes</th>}<th>Fecha</th>{headers.map((header, index) => <th key={String(header.uuid ?? header.name ?? index)}>{valueOf(header.shortName ?? header.name)}</th>)}</tr></thead><tbody>{regimenRows.map((row, rowIndex) => <tr key={String(row.uuid ?? row.date ?? rowIndex)}>{regimenRows.some((item) => item.month) && <td>{valueOf(row.month)}</td>}<td>{dateOf(row.date, props.context.locale, props.context.timeZone)}</td>{headers.map((header, headerIndex) => { const value = asRecord(row.drugs)[String(header.name)]; return <td className={value === "Stop" || value === "Error" ? "abnormal" : ""} key={String(header.uuid ?? header.name ?? headerIndex)}>{valueOf(value)}</td>; })}</tr>)}</tbody></table></div> : <div className="dashboard-matrix-scroll"><table className="dashboard-matrix drug-order-details"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Cantidad</th><th>Vía</th><th>Frecuencia</th><th>Inicio</th><th>Indicaciones</th><th>Indicaciones adicionales</th></tr></thead><tbody>{orders.map((order) => <tr className={order.active ? "active" : ""} key={order.uuid}><td>{order.name}</td><td>{order.dose}</td><td>{order.quantity}</td><td>{order.route}</td><td>{order.frequency}</td><td>{dateOf(order.startDate, props.context.locale, props.context.timeZone)}</td><td>{order.instructions || "—"}</td><td>{order.additionalInstructions || "—"}<small>{order.provider}</small></td></tr>)}</tbody></table></div>;
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!count} retry={() => void query.refetch()}>{table}<Button outlined icon="pi pi-print" label="Imprimir" onClick={() => window.print()} /><section className="print-sheet"><h1>{valueOf(props.section.raw.title ?? props.section.translationKey ?? "Tratamientos")}</h1><dl><dt>Paciente</dt><dd>{props.context.patient.name}</dd><dt>Identificador</dt><dd>{props.context.patient.identifier}</dd></dl>{table}</section></QueryFrame>;
}

function LabControl(props: DashboardControlProps) {
  const config = activeConfig(props);
  const query = useQuery({ queryKey: ["clinical-dashboard", "lab-results", props.context.patient.uuid, props.context.visit?.uuid, config.numberOfVisits], queryFn: () => getLabOrderResults({ patientUuid: props.context.patient.uuid, numberOfVisits: config.numberOfVisits as number | string | undefined }) });
  const root = asRecord(query.data);
  const accessions = groupLabAccessions(asRecords(root.results), {
    initialAccessionCount: typeof config.initialAccessionCount === "number" ? config.initialAccessionCount : undefined,
    latestAccessionCount: typeof config.latestAccessionCount === "number" ? config.latestAccessionCount : undefined,
  });
  const model = labTabularModel(root, asRecord(config.chartConfig).sortResultColumnsLatestFirst === true);
  const showTable = config.showTable !== false;
  const showChart = config.showChart !== false;
  const showNormal = config.showNormalLabResults !== false;
  const showNotes = config.showAccessionNotes !== false;
  const showCommentsExpanded = config.showCommentsExpanded === true;
  const hasData = accessions.length > 0 || model.orders.length > 0;
  useReport(props, query.isLoading, query.error, hasData ? 1 : 0);
  const testRow = (test: LabRecord, key: string) => {
    const abnormal = isAbnormalLabResult(test);
    if (!showNormal && !abnormal) return null;
    const range = normalRange(test);
    const file = typeof test.uploadedFileName === "string" ? test.uploadedFileName : undefined;
    return <Fragment key={key}><tr className={abnormal ? "abnormal" : ""}><td>{valueOf(test.preferredTestName ?? test.testName)}{range && <small>{range}</small>}{test.testUnitOfMeasurement ? <small>{valueOf(test.testUnitOfMeasurement)}</small> : null}</td><td>{test.referredOut === true && <abbr title="Derivado">R</abbr>} {valueOf(test.result)} {file && <a href={`/uploaded_results/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer" aria-label="Abrir resultado adjunto"><i className="pi pi-paperclip" /></a>}</td></tr>{Boolean(test.notes) ? <tr className="lab-result-note"><td colSpan={2}><details open={showCommentsExpanded}><summary>Comentario del resultado</summary><pre>{valueOf(test.notes)}</pre><small>{valueOf(test.provider)} · {dateOf(test.resultDateTime, props.context.locale, props.context.timeZone)}</small></details></td></tr> : config.showDetailsButton === true && <tr className="lab-result-note"><td colSpan={2}><details><summary>Ver detalles</summary><small>{valueOf(test.provider)} · {dateOf(test.resultDateTime, props.context.locale, props.context.timeZone)}</small></details></td></tr>}</Fragment>;
  };
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!hasData} retry={() => void query.refetch()}>
    {showChart && model.orders.length > 0 && <div className="dashboard-matrix-scroll"><table className="dashboard-matrix lab-results-chart"><thead><tr><th>Examen</th>{model.dates.map((date) => <th key={String(date.index)}>{dateOf(date.date, props.context.locale, props.context.timeZone)}</th>)}</tr></thead><tbody>{model.orders.map((order) => <tr key={String(order.index)}><th>{valueOf(order.preferredTestName ?? order.testName)}{normalRange(order) && <small>{normalRange(order)}</small>}{order.testUnitOfMeasurement ? <small>{valueOf(order.testUnitOfMeasurement)}</small> : null}</th>{model.dates.map((date) => <td key={String(date.index)}>{labResultFor(model, date.index, order.index).map((result, index) => {
      const file = typeof result.uploadedFileName === "string" ? result.uploadedFileName : undefined;
      return <span className={isAbnormalLabResult(result) ? "abnormal-value" : ""} key={index}>{valueOf(result.result)}{file && <a href={`/uploaded_results/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer"><i className="pi pi-paperclip" /></a>}</span>;
    })}</td>)}</tr>)}</tbody></table></div>}
    {showTable && accessions.map((accession) => <details className="lab-accession" open key={accession.uuid}><summary>Muestra · {dateOf(accession.date, props.context.locale, props.context.timeZone)}</summary>{showNotes && accession.notes.length > 0 && <div className="lab-accession-notes"><strong>Notas de la muestra</strong>{accession.notes.map((note, index) => <p key={index}>{valueOf(note.text)} <small>{valueOf(note.providerName)}</small></p>)}</div>}<table className="dashboard-matrix"><tbody>{accession.items.map((item, index) => item.kind === "panel" ? <Fragment key={`${accession.uuid}-panel-${index}`}><tr className="lab-panel-heading"><th colSpan={2}>{item.name}</th></tr>{item.tests.map((test, testIndex) => testRow(test, `${accession.uuid}-${index}-${testIndex}`))}</Fragment> : testRow(item.test, `${accession.uuid}-${index}`))}</tbody></table></details>)}
  </QueryFrame>;
}

function BacteriologyControl(props: DashboardControlProps) {
  const query = useQuery({ queryKey: ["clinical-dashboard", "bacteriology", props.context.patient.uuid, props.context.enrollmentUuid], queryFn: () => getBacteriologyResults({ patientUuid: props.context.patient.uuid, patientProgramUuid: props.context.enrollmentUuid }) });
  const specimens = mapBacteriologySpecimens(query.data ?? []);
  const edit = useMutation({ mutationFn: async (specimen: (typeof specimens)[number]) => {
    const rawEncounter = asRecord(specimen.raw.encounter);
    const report = asRecord(specimen.raw.report);
    const encounterUuid = valueOf(specimen.raw.encounterUuid ?? rawEncounter.uuid ?? report.encounterUuid);
    const existingObs = valueOf(specimen.raw.existingObs);
    const resolvedEncounterUuid = encounterUuid !== "—" ? encounterUuid : existingObs !== "—" ? await getObservationEncounterUuid(existingObs) : undefined;
    if (!resolvedEncounterUuid) throw new Error("No fue posible identificar el encuentro de la muestra.");
    const search = new URLSearchParams({ encounterUuid: resolvedEncounterUuid });
    if (props.context.visit?.uuid) search.set("visitUuid", props.context.visit.uuid);
    window.location.assign(`/clinical/patient/${encodeURIComponent(props.context.patient.uuid)}/consultation/bacteriology?${search}`);
  }});
  useReport(props, query.isLoading, query.error, specimens.length);
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!specimens.length} retry={() => void query.refetch()}>{edit.isError && <p role="alert" className="error-banner">{edit.error instanceof Error ? edit.error.message : "No fue posible abrir la muestra."}</p>}<div className="bacteriology-specimens">{specimens.map((specimen) => <details key={specimen.uuid}><summary><span><strong>{specimen.source}</strong> · {specimen.identifier}</span><span><time>{dateOf(specimen.collectedAt, props.context.locale, props.context.timeZone)}</time>{props.context.privilegeNames.has("app:clinical:bacteriologyTab") && <Button text icon="pi pi-pencil" label="Editar" loading={edit.isPending && edit.variables === specimen} onClick={(event) => { event.preventDefault(); edit.mutate(specimen); }} />}</span></summary>{specimen.results.length ? specimen.results.map((result, index) => <RecordTable key={index} records={[result]} locale={props.context.locale} timeZone={props.context.timeZone} />) : <p className="muted-text">No hay resultados para esta muestra.</p>}</details>)}</div></QueryFrame>;
}

function AdmissionControl(props: DashboardControlProps) {
  const query = useQuery({ queryKey: ["clinical-dashboard", "bed", props.context.patient.uuid, props.context.visit?.uuid], enabled: Boolean(props.context.visit), queryFn: () => getAssignedBed(props.context.patient.uuid, props.context.visit?.uuid) });
  const model = normalizeAdmissionDetails(props.context.visitSummary, query.data);
  const count = Number(Boolean(model.admission)) + Number(Boolean(model.discharge));
  useReport(props, query.isLoading, query.error, count);
  const eventRow = (label: string, event: typeof model.admission) => event && <><tr><th>{label}</th><td>{dateOf(event.date, props.context.locale, props.context.timeZone)}</td></tr>{(event.notes || event.provider) && <tr className="dashboard-detail-row"><td colSpan={2}>{event.notes && <pre>{event.notes}</pre>}<small>{[event.provider, event.date ? new Intl.DateTimeFormat(props.context.locale, { timeStyle: "short", ...(props.context.timeZone ? { timeZone: props.context.timeZone } : {}) }).format(new Date(event.date)) : undefined].filter(Boolean).join(" · ")}</small></td></tr>}</>;
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!count} retry={() => void query.refetch()}><div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><tbody>{(model.ward || model.bed) && <tr><th>{model.ward || "—"}</th><td>{model.bed || "—"}</td></tr>}{eventRow("Fecha de admisión", model.admission)}{eventRow("Fecha de alta", model.discharge)}{model.daysAdmitted !== undefined && <tr><th>Días hospitalizado</th><td>{model.daysAdmitted}</td></tr>}</tbody></table></div></QueryFrame>;
}

function FormsV2Control(props: DashboardControlProps) {
  useReport(props, false, null, 1);
  return <ClinicalMfeHost section={props.section} patient={props.context.patient} visitUuid={props.context.visit?.uuid} visitIsActive={Boolean(props.context.visit && !props.context.visit.stopDatetime)} visits={props.context.visits} />;
}

function AppointmentsControl(props: DashboardControlProps) {
  const upcoming = useQuery({ queryKey: ["clinical-dashboard", "appointments", "upcoming", props.context.patient.uuid], queryFn: () => getAppointments(props.context.patient.uuid, "upcoming") });
  const past = useQuery({ queryKey: ["clinical-dashboard", "appointments", "past", props.context.patient.uuid], queryFn: () => getAppointments(props.context.patient.uuid, "past") });
  const appConfig = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical") });
  const upcomingAppointments = normalizeAppointments(upcoming.data ?? [], props.context.locale);
  const pastAppointments = normalizeAppointments(past.data ?? [], props.context.locale);
  const error = upcoming.error ?? past.error ?? appConfig.error;
  const loading = upcoming.isLoading || past.isLoading || appConfig.isLoading;
  useReport(props, loading, error, upcomingAppointments.length + pastAppointments.length);
  const domain = typeof appConfig.data?.config === "object" ? valueOf(asRecord(appConfig.data.config).teleConsultationDomain) : valueOf(appConfig.data?.teleConsultationDomain);
  const table = (items: DashboardAppointment[], upcomingTable: boolean) => items.length ? <div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Fecha</th><th>Horario</th><th>Detalle</th><th>Estado</th>{upcomingTable && <th>Teleconsulta</th>}</tr></thead><tbody>{items.map((appointment) => <tr key={appointment.uuid}><td>{appointment.date ? new Intl.DateTimeFormat(props.context.locale, { dateStyle: "medium" }).format(appointment.date) : "—"}</td><td>{appointment.slot}</td><td>{Object.entries(appointment.details).filter(([key]) => key !== "DASHBOARD_APPOINTMENTS_STATUS_KEY").map(([, value]) => valueOf(value)).filter((value) => value !== "—").join(" · ") || "—"}</td><td>{appointment.status || "—"}</td>{upcomingTable && <td>{appointment.kind === "Virtual" && appointment.status === "Scheduled" ? <Button text icon="pi pi-video" label="Unirse" onClick={() => { const url = appointmentMeetingUrl(appointment, domain); if (url) window.open(url, "_blank", "noopener,noreferrer"); }} /> : "—"}</td>}</tr>)}</tbody></table></div> : <p className="muted-text">No hay citas.</p>;
  return <QueryFrame loading={loading} error={error} empty={false} retry={() => { void upcoming.refetch(); void past.refetch(); void appConfig.refetch(); }}><h3>Próximas citas</h3>{table(upcomingAppointments, true)}<h3>Citas pasadas</h3>{table(pastAppointments, false)}<a className="p-button p-component p-button-outlined" href="/appointments/#/home/manage/appointments/list" target="_blank" rel="noreferrer">Gestionar citas</a></QueryFrame>;
}

function GesControl(props: DashboardControlProps) {
  const query = useQuery({ queryKey: ["clinical-dashboard", "ges", props.context.patient.identifier], queryFn: () => getGesNotifications(props.context.patient.identifier) });
  const data = query.data ?? [];
  const practitioner = Cookies.get("bahmni.user") ?? "";
  const discard = useMutation({ mutationFn: (id: string) => discardGesNotification(id, practitioner), onSuccess: () => query.refetch() });
  useReport(props, query.isLoading, query.error, data.length);
  const statuses: Record<string, string> = { P: "Pendiente", N: "Notificada", D: "Descartada", F: "Firmada por paciente" };
  return <QueryFrame loading={query.isLoading} error={query.error} empty={!data.length} retry={() => void query.refetch()}>{discard.isError && <p role="alert" className="error-banner">No fue posible descartar la notificación.</p>}<div className="dashboard-matrix-scroll"><table className="dashboard-matrix"><thead><tr><th>Problema GES</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{data.map((item, index) => { const id = valueOf(item.id); const status = valueOf(item.estado); return <tr key={String(item.id ?? index)}><td>{valueOf(item.problema_ges)}</td><td>{dateOf(item.fecha, props.context.locale, props.context.timeZone)}</td><td>{statuses[status] ?? status}</td><td><span className="dashboard-inline-actions">{status === "P" && <><a href={`/notificacion/notificacionges/${encodeURIComponent(id)}?practitioner=${encodeURIComponent(practitioner)}`} target="_blank" rel="noreferrer">Notificar</a><Button text severity="danger" label="Descartar" loading={discard.isPending && discard.variables === id} disabled={!practitioner} onClick={() => discard.mutate(id)} /></>}{(status === "N" || status === "F") && <a href={`/notificacion/vernotificacionges/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Ver</a>}</span></td></tr>; })}</tbody></table></div></QueryFrame>;
}

function CustomControl(props: DashboardControlProps) {
  const template = typeof props.section.config.template === "string" ? props.section.config.template : "";
  return template.includes("patient-appointments-dashboard") ? <AppointmentsControl {...props} /> : template.includes("notificacion-ges") ? <GesControl {...props} /> : <UnsupportedControl {...props} />;
}

function AllOrdersControl(props: DashboardControlProps) {
  useReport(props, false, null, 1);
  return <ClinicalMfeHost section={props.section} patient={props.context.patient} visitUuid={props.context.visit?.uuid} visitIsActive={Boolean(props.context.visit && !props.context.visit.stopDatetime)} visits={props.context.visits} />;
}

function IpsControl(props: DashboardControlProps) {
  useReport(props, false, null, 1);
  return <ClinicalMfeHost section={props.section} patient={props.context.patient} visitUuid={props.context.visit?.uuid} visitIsActive={Boolean(props.context.visit && !props.context.visit.stopDatetime)} visits={props.context.visits} />;
}

function UnsupportedControl(props: DashboardControlProps) {
  useReport(props, false, null, 1);
  return <p role="alert" className="warning-banner">El tipo <strong>{props.section.type}</strong> está registrado, pero su contrato HCSBA no contiene un adaptador utilizable.</p>;
}

const registryEntries: DashboardControlAdapter[] = [
  { type: "patientInformation", Component: PatientInformationControl, supportsExpanded: false, capabilities: ["read"] },
  { type: "visits", Component: VisitsControl, supportsExpanded: true, capabilities: ["read", "navigate"] },
  { type: "navigationLinksControl", Component: NavigationControl, supportsExpanded: false, capabilities: ["navigate"] },
  { type: "diagnosis", Component: DiagnosisControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "allergies", Component: AllergyDashboardControl, HeaderAction: AllergyHeaderAction, supportsExpanded: true, capabilities: ["read", "edit"] },
  { type: "conditionsList", Component: ConditionControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "programs", Component: ProgramDashboardControl, HeaderAction: ProgramHeaderAction, supportsExpanded: true, capabilities: ["read", "navigate"] },
  ...["observation", "vitals", "observationGraph", "historyAndExamination"].map((type): DashboardControlAdapter => ({ type, Component: ObservationControl, supportsExpanded: true, capabilities: ["read"] })),
  { type: "flowSheet", Component: PivotTableControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "obsToObsFlowSheet", Component: ObsToObsFlowSheetControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "disposition", Component: DispositionControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "radiology", Component: RadiologyDocumentsControl, supportsExpanded: true, capabilities: ["read", "navigate"] },
  ...["ordersControl", "pacsOrders"].map((type): DashboardControlAdapter => ({ type, Component: OrdersControl, supportsExpanded: true, capabilities: ["read", ...(type === "pacsOrders" ? ["navigate" as const] : [])] })),
  ...["treatment", "drugOrderDetails", "chronicTreatmentChart"].map((type): DashboardControlAdapter => ({ type, Component: DrugControl, supportsExpanded: true, capabilities: ["read", "print"] })),
  { type: "labOrders", Component: LabControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "bacteriologyResultsControl", Component: BacteriologyControl, supportsExpanded: true, capabilities: ["read", "edit"] },
  { type: "admissionDetails", Component: AdmissionControl, supportsExpanded: true, capabilities: ["read"] },
  { type: "forms", Component: FormsV2Control, supportsExpanded: true, capabilities: ["read", "edit", "print"] },
  { type: "formsV2React", Component: FormsV2Control, supportsExpanded: true, capabilities: ["read", "edit", "print"] },
  { type: "allOrdersReact", Component: AllOrdersControl, supportsExpanded: true, capabilities: ["read", "print", "share"] },
  { type: "custom", Component: CustomControl, supportsExpanded: true, capabilities: ["read", "navigate"] },
  { type: "ipsReact", Component: IpsControl, supportsExpanded: true, capabilities: ["read", "share"] },
  { type: "ipsIcvpReact", Component: IpsControl, supportsExpanded: true, capabilities: ["read", "share"] },
];

export const DashboardControlRegistry = new Map(registryEntries.map((adapter) => [adapter.type, adapter]));
export const dashboardControlTypes = new Set(DashboardControlRegistry.keys());

export function getDashboardControlAdapter(type: string): DashboardControlAdapter {
  return DashboardControlRegistry.get(type) ?? { type, Component: UnsupportedControl, supportsExpanded: false, capabilities: [] };
}
