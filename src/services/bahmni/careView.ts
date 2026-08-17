import { z } from "zod";
import { classifyTaskStatus } from "@/features/ipd/care-view/domain";
import type {
  CareTask,
  CareTaskKind,
  CareTeamParticipant,
  CareViewPatient,
  CareViewPatientPage,
  CareViewWardSummary,
} from "@/features/ipd/care-view/types";
import { bahmniRequest, queryString } from "./http";

const looseObject = z.record(z.string(), z.unknown());

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function epochMillis(value: unknown): number | undefined {
  const number = numeric(value, NaN);
  if (Number.isFinite(number)) return number < 10_000_000_000 ? number * 1_000 : number;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function arrayPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const source = object(value);
  // The ward patient endpoints use `admittedPatients`; the other keys are
  // retained for tolerant compatibility with OpenMRS/Bahmni variants.
  for (const key of ["admittedPatients", "results", "patients", "tasks", "data", "items"]) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function providerParticipant(value: unknown): CareTeamParticipant {
  const source = object(value);
  const provider = object(source.provider ?? source.providerDetails);
  return {
    ...source,
    uuid: text(source.uuid),
    providerUuid: text(source.providerUuid) ?? text(provider.uuid),
    providerName: text(source.providerName) ?? text(provider.display) ?? text(provider.name),
    startTime: epochMillis(source.startTime),
    endTime: epochMillis(source.endTime),
    voided: source.voided === true,
  };
}

export function normalizeCareViewPatient(value: unknown): CareViewPatient {
  const source = object(value);
  const patient = object(source.patient ?? source.patientDetails);
  const person = object(patient.person ?? source.person);
  const bed = object(source.bed ?? source.bedDetails);
  const visit = object(source.visit ?? source.visitDetails);
  const name = object(person.preferredName ?? patient.preferredName);
  const identifiers = Array.isArray(patient.identifiers) ? patient.identifiers.map(object) : [];
  const composedName = [name.givenName, name.middleName, name.familyName]
    .filter((part): part is string => typeof part === "string" && Boolean(part))
    .join(" ");
  const careTeam = object(source.careTeam ?? source.careTeamDetails);
  const participantsSource = source.careTeamParticipants
    ?? source.careTeamParticipant
    ?? source.participants
    ?? careTeam.participants;
  const participants = Array.isArray(participantsSource) ? participantsSource.map(providerParticipant) : [];
  const newTreatments = source.newTreatments;
  return {
    uuid: text(source.patientUuid) ?? text(patient.uuid) ?? text(source.uuid) ?? "",
    visitUuid: text(source.visitUuid) ?? text(visit.uuid),
    name: text(source.patientName) ?? text(patient.display) ?? text(person.display) ?? (composedName || "Paciente"),
    identifier: text(source.patientIdentifier)
      ?? text(source.identifier)
      ?? text(patient.identifier)
      ?? text(identifiers.find((identifier) => identifier.preferred === true)?.identifier)
      ?? text(identifiers[0]?.identifier),
    bedNumber: text(source.bedNumber) ?? text(bed.bedNumber) ?? text(bed.display),
    gender: text(source.gender) ?? text(person.gender),
    age: typeof source.age === "number" || typeof source.age === "string" ? source.age : typeof person.age === "number" ? person.age : undefined,
    admissionDate: epochMillis(source.admissionDate ?? source.admissionDateTime ?? source.visitStartDateTime ?? visit.startDatetime),
    hasNewTreatments: source.hasNewTreatments === true
      || source.newTreatment === true
      || numeric(source.newTreatmentsCount) > 0
      || (Array.isArray(newTreatments) && newTreatments.length > 0),
    careTeamParticipants: participants,
    extensions: source,
  };
}

function normalizePatientPage(value: unknown): CareViewPatientPage {
  const source = object(value);
  const patients = arrayPayload(value).map(normalizeCareViewPatient).filter((patient) => patient.uuid);
  return { patients, totalCount: numeric(source.totalCount ?? source.totalPatients ?? source.count, patients.length) };
}

export async function getCareWardSummary(wardUuid: string, providerUuid: string): Promise<CareViewWardSummary> {
  const response = await bahmniRequest(`/ws/rest/v1/ipd/wards/${encodeURIComponent(wardUuid)}/summary${queryString({ providerUuid })}`, { schema: looseObject, cache: "no-store" });
  return {
    totalPatients: numeric(response.totalPatients ?? response.allPatientsCount ?? response.totalCount),
    myPatients: numeric(response.myPatients ?? response.myPatientsCount ?? response.providerPatientCount),
    extensions: response,
  };
}

export async function getCareWardPatients(wardUuid: string, offset: number, limit: number): Promise<CareViewPatientPage> {
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/wards/${encodeURIComponent(wardUuid)}/patients${queryString({ offset, limit })}`, { cache: "no-store" });
  return normalizePatientPage(response);
}

export async function getMyCarePatients(wardUuid: string, providerUuid: string, offset: number, limit: number): Promise<CareViewPatientPage> {
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/wards/${encodeURIComponent(wardUuid)}/myPatients${queryString({ offset, limit, providerUuid })}`, { cache: "no-store" });
  return normalizePatientPage(response);
}

export async function searchCarePatients(wardUuid: string, searchValue: string, offset: number, limit: number): Promise<CareViewPatientPage> {
  const parameters = new URLSearchParams({ offset: String(offset), limit: String(limit), searchValue });
  // Legacy serializes arrays with Axios `indexes: null`, producing repeated
  // parameters without square brackets. OpenMRS binds that exact wire format.
  for (const key of ["bedNumber", "patientIdentifier", "patientName"]) parameters.append("searchKeys", key);
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/wards/${encodeURIComponent(wardUuid)}/patients/search?${parameters.toString()}`, { cache: "no-store" });
  return normalizePatientPage(response);
}

function collectTaskRows(value: unknown, patientUuid?: string): Array<{ row: Record<string, unknown>; patientUuid?: string }> {
  if (Array.isArray(value)) return value.flatMap((item) => collectTaskRows(item, patientUuid));
  const source = object(value);
  if (!Object.keys(source).length) return [];
  // The bulk /tasks contract groups rows by the real patient UUID, but each
  // nested task exposes the encounter UUID in its patientUuid field. Once a
  // parent supplied the patient identity it must take precedence over the
  // misleading nested value or Care View drops every task during row matching.
  const inheritedPatientUuid = patientUuid ?? text(source.patientUuid) ?? text(object(source.patient).uuid);
  const nestedKeys = ["results", "tasks", "slots", "schedules", "medications", "medicationTasks", "data", "items"];
  const nested = nestedKeys.flatMap((key) => source[key] === undefined ? [] : collectTaskRows(source[key], inheritedPatientUuid));
  const hasTaskIdentity = source.uuid !== undefined || source.taskUuid !== undefined || source.scheduleUuid !== undefined;
  const hasTaskTime = source.startTime !== undefined
    || source.scheduledTime !== undefined
    || source.scheduledDateTime !== undefined
    || source.requestedStartTime !== undefined;
  return hasTaskIdentity || hasTaskTime ? [{ row: source, patientUuid: inheritedPatientUuid }, ...nested] : nested;
}

function taskName(source: Record<string, unknown>): string {
  const order = object(source.order ?? source.drugOrder);
  const drug = object(source.drug ?? source.medication ?? order.drug);
  const task = object(source.task ?? source.taskType);
  return text(source.name)
    ?? text(source.taskName)
    ?? text(source.drugName)
    ?? text(drug.display)
    ?? text(drug.name)
    ?? text(order.display)
    ?? text(task.display)
    ?? text(task.name)
    ?? "Tarea";
}

export function normalizeCareTasks(value: unknown, kind: CareTaskKind, thresholds: { pastLateMinutes: number; administeredLateMinutes: number }): CareTask[] {
  return collectTaskRows(value).flatMap(({ row, patientUuid }, index) => {
    if (!patientUuid) return [];
    // Non-medication tasks use requestedStartTime while medication slots use
    // startTime/scheduledTime. Legacy deliberately supports both contracts.
    const requestedStartTime = epochMillis(row.requestedStartTime);
    const requestedEndTime = epochMillis(row.requestedEndTime);
    const creator = object(row.creator ?? row.createdBy);
    const creatorName = text(row.creatorName) ?? text(row.creator) ?? text(creator.username) ?? text(creator.display);
    // The IPD rollover job rewrites requestedStartTime to the beginning of the
    // new shift and deliberately leaves requestedEndTime untouched. Tasks made
    // by a clinician are created with start=end, so after rollover the end is
    // the only surviving representation of the time selected by the user.
    // Daemon tasks have no requested end and must remain at the shift boundary.
    const rolledOverClinicianTask = kind === "non-medication"
      && Boolean(requestedStartTime && requestedEndTime && requestedEndTime > requestedStartTime)
      && creatorName?.toLowerCase() !== "daemon";
    const scheduledTime = rolledOverClinicianTask
      ? requestedEndTime
      : requestedStartTime ?? epochMillis(row.scheduledTime ?? row.startTime ?? row.scheduledDateTime ?? row.date);
    if (!scheduledTime) return [];
    const order = object(row.order ?? row.drugOrder);
    const administration = object(row.medicationAdministration ?? row.administration);
    const completedTime = epochMillis(row.executionEndTime ?? row.completedTime ?? row.administeredTime ?? row.actualTime ?? row.endTime ?? administration.administeredDateTime);
    const rawStatus = text(row.status) ?? text(row.taskStatus) ?? text(object(row.task).status);
    const rawDose = row.dose ?? order.dose;
    const status = classifyTaskStatus({
      rawStatus,
      scheduledTime,
      completedTime,
      pastLateMinutes: thresholds.pastLateMinutes,
      administeredLateMinutes: thresholds.administeredLateMinutes,
      voided: row.voided === true,
    });
    return [{
      uuid: text(row.uuid) ?? text(row.taskUuid) ?? text(row.scheduleUuid) ?? `${patientUuid}-${kind}-${scheduledTime}-${index}`,
      patientUuid,
      kind,
      name: taskName(row),
      status,
      rawStatus,
      scheduledTime,
      completedTime,
      dose: typeof rawDose === "string" || typeof rawDose === "number" ? rawDose : undefined,
      doseUnit: text(row.doseUnit) ?? text(row.doseUnits) ?? text(object(order.doseUnits).display) ?? text(object(order.doseUnits).name),
      route: text(row.route) ?? text(object(order.route).display) ?? text(object(order.route).name),
      creator: creatorName,
      extensions: row,
    } satisfies CareTask];
  }).sort((left, right) => left.scheduledTime - right.scheduledTime || left.name.localeCompare(right.name));
}

export async function getMedicationTasks(patientUuids: string[], startMillis: number, endMillis: number, thresholds: { pastLateMinutes: number; administeredLateMinutes: number }): Promise<CareTask[]> {
  if (!patientUuids.length) return [];
  const parameters = new URLSearchParams({
    startTime: String(Math.floor(startMillis / 1_000)),
    endTime: String(Math.floor(endMillis / 1_000)),
    includePreviousSlot: "true",
    includeSlotDuration: "true",
  });
  for (const patientUuid of patientUuids) parameters.append("patientUuids", patientUuid);
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/schedule/type/medication/patientsMedicationSummary?${parameters.toString()}`, { cache: "no-store" });
  return normalizeCareTasks(response, "medication", thresholds);
}

export async function getNonMedicationTasks(patientUuids: string[], startMillis: number, endMillis: number, thresholds: { pastLateMinutes: number; administeredLateMinutes: number }): Promise<CareTask[]> {
  if (!patientUuids.length) return [];
  const parameters = new URLSearchParams({
    startTime: String(startMillis),
    endTime: String(Math.max(startMillis, endMillis - 60_000)),
  });
  for (const patientUuid of patientUuids) parameters.append("patientUuids", patientUuid);
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/tasks?${parameters.toString()}`, { cache: "no-store" });
  return normalizeCareTasks(response, "non-medication", thresholds);
}

export async function getPatientMedicationTasks(
  patientUuid: string,
  visitUuid: string,
  startMillis: number,
  endMillis: number,
  thresholds: { pastLateMinutes: number; administeredLateMinutes: number },
  view?: "drugChart",
): Promise<CareTask[]> {
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/schedule/type/medication${queryString({
    patientUuid,
    visitUuid,
    startTime: Math.floor(startMillis / 1_000),
    endTime: Math.max(Math.floor(startMillis / 1_000), Math.floor(endMillis / 1_000) - 60),
    view,
  })}`, { cache: "no-store" });
  return normalizeCareTasks({ patientUuid, tasks: response }, "medication", thresholds);
}

export async function getPatientNonMedicationTasks(
  patientUuid: string,
  _visitUuid: string,
  startMillis: number,
  endMillis: number,
  thresholds: { pastLateMinutes: number; administeredLateMinutes: number },
): Promise<CareTask[]> {
  // A task is linked to the Consultation encounter created for task capture,
  // not necessarily to the IPD encounter UUID currently shown by the page.
  // Querying by patient is the legacy contract and returns every encounter
  // group belonging to the admission without losing clinician-created tasks.
  const parameters = new URLSearchParams({
    patientUuids: patientUuid,
    startTime: String(startMillis),
    endTime: String(Math.max(startMillis, endMillis - 60_000)),
  });
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/tasks?${parameters.toString()}`, { cache: "no-store" });
  return normalizeCareTasks(response, "non-medication", thresholds);
}

export interface ScheduledMedicationAdministrationPayload {
  patientUuid: string;
  orderUuid: string;
  providers: Array<{ providerUuid: string; function: "Performer" }>;
  notes: Array<{ authorUuid: string; text: string }>;
  status: "completed" | "not-done";
  slotUuid: string;
  administeredDateTime: number;
}

export interface NonMedicationTaskUpdatePayload {
  uuid: string;
  status: "COMPLETED" | "REJECTED";
  executionEndTime: number;
  comment?: string;
}

export interface IpdDrugOption {
  uuid: string;
  name: string;
  strength?: string;
  dosageForm?: string;
}

export interface IpdProviderOption {
  uuid: string;
  name: string;
}

export interface IpdDrugOrderConfig {
  doseUnits: string[];
  routes: string[];
}

export interface AdhocMedicationPayload {
  patientUuid: string;
  drugUuid: string;
  dose: number;
  doseUnits: string;
  route: string;
  providers: Array<{
    providerUuid: string;
    function: "Performer" | "Witness";
  }>;
  notes: Array<{ authorUuid: string; text: string }>;
  status: "completed";
  administeredDateTime: number;
}

export interface NonMedicationTaskCreatePayload {
  name: string;
  requestedStartTime: number;
  requestedEndTime: number;
  patientUuid: string;
  encounterUuid: string;
  intent: "ORDER";
  taskType: string | null;
  status: "REQUESTED";
}

export async function getIpdDrugOrderConfig(): Promise<IpdDrugOrderConfig> {
  const response = await bahmniRequest<Record<string, unknown>>("/ws/rest/v1/bahmnicore/config/drugOrders", {
    schema: looseObject,
    cache: "no-store",
  });
  const names = (value: unknown): string[] => Array.isArray(value)
    ? value.map((entry) => text(object(entry).name) ?? text(object(entry).display)).filter((entry): entry is string => Boolean(entry))
    : [];
  return { doseUnits: names(response.doseUnits), routes: names(response.routes) };
}

export async function searchIpdDrugs(query: string): Promise<IpdDrugOption[]> {
  if (query.trim().length < 2) return [];
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/drug${queryString({
    q: query.trim(),
    s: "ordered",
    v: "custom:(uuid,strength,name,dosageForm)",
  })}`, { cache: "no-store" });
  return arrayPayload(response).flatMap((value) => {
    const source = object(value);
    const uuid = text(source.uuid);
    const name = text(source.name) ?? text(source.display);
    if (!uuid || !name) return [];
    return [{
      uuid,
      name,
      strength: text(source.strength),
      dosageForm: text(object(source.dosageForm).display) ?? text(object(source.dosageForm).name),
    }];
  });
}

export async function getIpdTaskProviders(): Promise<IpdProviderOption[]> {
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/provider${queryString({
    v: "custom:(person,uuid,retired)",
    attrName: "practitioner_type",
    attrValue: "Doctor",
  })}`, { cache: "no-store" });
  return arrayPayload(response).flatMap((value) => {
    const source = object(value);
    if (source.retired === true) return [];
    const uuid = text(source.uuid);
    const person = object(source.person);
    const name = text(person.display) ?? text(source.display);
    return uuid && name ? [{ uuid, name }] : [];
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export async function ensureIpdTaskEncounter(patientUuid: string, locationUuid: string): Promise<string> {
  const encounterType = await bahmniRequest<Record<string, unknown>>("/ws/rest/v1/encountertype/Consultation", {
    schema: looseObject,
    cache: "no-store",
  });
  const encounterTypeUuid = text(encounterType.uuid);
  if (!encounterTypeUuid) throw new Error("OpenMRS no devolvió el tipo de encuentro Consultation.");
  const response = await bahmniRequest<Record<string, unknown>>("/ws/rest/v1/bahmnicore/bahmniencounter", {
    method: "POST",
    body: JSON.stringify({ patientUuid, locationUuid, encounterTypeUuid }),
    schema: looseObject,
  });
  const encounterUuid = text(response.encounterUuid) ?? text(response.uuid);
  if (!encounterUuid) throw new Error("OpenMRS no confirmó el encuentro asociado a la tarea.");
  return encounterUuid;
}

export async function createAdhocMedicationAdministration(payload: AdhocMedicationPayload): Promise<unknown> {
  return bahmniRequest("/ws/rest/v1/ipd/adhocMedicationAdministrations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createNonMedicationTask(payload: NonMedicationTaskCreatePayload): Promise<unknown> {
  return bahmniRequest("/ws/rest/v1/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateScheduledMedicationAdministrations(
  payload: ScheduledMedicationAdministrationPayload[],
): Promise<unknown> {
  return bahmniRequest("/ws/rest/v1/ipd/scheduledMedicationAdministrations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateNonMedicationTasks(payload: NonMedicationTaskUpdatePayload[]): Promise<unknown> {
  return bahmniRequest("/ws/rest/v1/tasks", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

type CareTeamParticipantMutation =
  | { providerUuid: string; startTimeMillis: number; endTimeMillis: number }
  | { uuid: string; voided: true };

export interface CareTeamUpdateResult {
  patientUuid?: string;
  participants: CareTeamParticipant[];
  extensions: Record<string, unknown>;
}

export function buildCareTeamParticipantRequest(participant: CareTeamParticipantMutation):
  | { providerUuid: string; startTime: number; endTime: number }
  | { uuid: string; voided: true } {
  if ("providerUuid" in participant) {
    return {
      providerUuid: participant.providerUuid,
      // The legacy IPD write contract consumes Unix seconds even though its
      // participant responses expose startTime/endTime as epoch milliseconds.
      startTime: Math.floor(participant.startTimeMillis / 1_000),
      endTime: Math.floor(participant.endTimeMillis / 1_000),
    };
  }
  return participant;
}

export function normalizeCareTeamUpdate(value: unknown): CareTeamUpdateResult {
  const source = object(value);
  return {
    patientUuid: text(source.patientUuid),
    participants: Array.isArray(source.participants) ? source.participants.map(providerParticipant) : [],
    extensions: source,
  };
}

export async function updateCareTeamParticipant(payload: {
  patientUuid: string;
  visitUuid: string;
  participant: CareTeamParticipantMutation;
}): Promise<CareTeamUpdateResult> {
  const response = await bahmniRequest("/ws/rest/v1/ipd/careteam/participants", {
    method: "POST",
    body: JSON.stringify({
      patientUuid: payload.patientUuid,
      visitUuid: payload.visitUuid,
      careTeamParticipantsRequest: [buildCareTeamParticipantRequest(payload.participant)],
    }),
    schema: looseObject,
  });
  return normalizeCareTeamUpdate(response);
}

export const careViewQueryKeys = {
  config: ["ipd", "care-view", "config"] as const,
  operationalConfig: ["ipd", "care-view", "operational-config"] as const,
  summary: (wardUuid?: string, providerUuid?: string) => ["ipd", "care-view", "summary", wardUuid, providerUuid] as const,
  patients: (wardUuid?: string, mode?: string, offset?: number, limit?: number, search?: string) => ["ipd", "care-view", "patients", wardUuid, mode, offset, limit, search] as const,
  tasks: (kind: string, wardUuid?: string, patients?: string[], start?: number, end?: number) => ["ipd", "care-view", "tasks", kind, wardUuid, patients?.join(","), start, end] as const,
};
