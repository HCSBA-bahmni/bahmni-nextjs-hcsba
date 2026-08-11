import { z } from "zod";
import { bahmniRequest, queryString } from "./http";

const record = z.record(z.string(), z.unknown());
const records = z.array(record);
const results = z.object({ results: records.default([]) }).loose();
const orderTypeSchema = z.object({ uuid: z.string(), display: z.string().optional(), name: z.string().optional() }).loose();

export type DashboardRecord = z.infer<typeof record>;

export async function getDispositions(params: { patientUuid: string; visitUuid?: string; numberOfVisits?: number | string; locale: string }) {
  const path = params.visitUuid
    ? `/ws/rest/v1/bahmnicore/disposition/visitWithLocale${queryString({ visitUuid: params.visitUuid, locale: params.locale })}`
    : `/ws/rest/v1/bahmnicore/disposition/patientWithLocale${queryString({ patientUuid: params.patientUuid, numberOfVisits: params.numberOfVisits, locale: params.locale })}`;
  return bahmniRequest(path, { schema: records });
}

export async function getOrderTypes() {
  const response = await bahmniRequest(`/ws/rest/v1/ordertype${queryString({ v: "default" })}`, { schema: z.object({ results: z.array(orderTypeSchema).default([]) }).loose() });
  return response.results;
}

export async function getDashboardOrders(params: { patientUuid: string; orderTypeUuid?: string; conceptNames?: string[]; numberOfVisits?: number | string; visitUuid?: string; includeObs?: boolean; obsIgnoreList?: string[] }) {
  const search = new URLSearchParams();
  for (const concept of params.conceptNames ?? []) search.append("concept", concept);
  for (const ignored of params.obsIgnoreList ?? []) search.append("obsIgnoreList", ignored);
  search.set("patientUuid", params.patientUuid);
  search.set("includeObs", String(params.includeObs ?? true));
  if (params.orderTypeUuid) search.set("orderTypeUuid", params.orderTypeUuid);
  if (params.numberOfVisits !== undefined) search.set("numberOfVisits", String(params.numberOfVisits));
  if (params.visitUuid) search.set("visitUuid", params.visitUuid);
  return bahmniRequest(`/ws/rest/v1/bahmnicore/orders?${search}`, { schema: records });
}

export async function getStandardOrders(params: { patientUuid: string; orderTypeUuid: string }) {
  const response = await bahmniRequest(`/ws/rest/v1/order${queryString({ patient: params.patientUuid, orderType: params.orderTypeUuid, v: "full", limit: 100 })}`, { schema: results });
  return response.results;
}

export async function getDashboardDrugOrders(patientUuid: string) {
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/bahmnicore/drugOrders${queryString({ patientUuid, numberOfVisits: 20, includeActiveVisit: true })}`);
  if (Array.isArray(response)) return records.parse(response);
  if (!response || typeof response !== "object") return [];
  return records.parse(Object.values(response as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : []));
}

export async function getPrescribedAndActiveDrugOrders(params: {
  patientUuid: string;
  numberOfVisits?: number | string;
  showOtherActive?: boolean;
  visitUuids?: string[];
  preferredLocale?: string;
}) {
  const search = new URLSearchParams({ patientUuid: params.patientUuid });
  if (params.numberOfVisits !== undefined) search.set("numberOfVisits", String(params.numberOfVisits));
  if (params.showOtherActive !== undefined) search.set("getOtherActive", String(params.showOtherActive));
  if (params.preferredLocale) search.set("preferredLocale", params.preferredLocale);
  for (const visitUuid of params.visitUuids ?? []) search.append("visitUuids", visitUuid);
  return bahmniRequest(`/ws/rest/v1/bahmnicore/drugOrders/prescribedAndActive?${search}`, { schema: record });
}

export interface PatientEmailAttachment { contentType: string; name: string; data: string }
export async function sendPatientEmail(patientUuid: string, payload: { mailAttachments: PatientEmailAttachment[]; subject: string; body: string; cc?: string[]; bcc?: string[] }) {
  const response = await bahmniRequest(`/ws/rest/v1/patient/${encodeURIComponent(patientUuid)}/send/email`, {
    method: "POST",
    body: JSON.stringify({ ...payload, cc: payload.cc ?? [], bcc: payload.bcc ?? [] }),
    schema: record,
  });
  const statusLine = response.statusLine;
  if (statusLine && typeof statusLine === "object" && !Array.isArray(statusLine)) {
    const statusCode = (statusLine as Record<string, unknown>).statusCode;
    if (typeof statusCode === "number" && statusCode !== 200) {
      throw new Error(String((statusLine as Record<string, unknown>).reasonPhrase ?? `Email service returned ${statusCode}`));
    }
  }
  return response;
}

export async function getObservationsByConceptUuid(params: { patientUuid: string; conceptUuid: string; limit?: number }) {
  const response = await bahmniRequest(`/ws/rest/v1/obs${queryString({
    patient: params.patientUuid,
    concept: params.conceptUuid,
    v: "custom:(uuid,obsDatetime,value,valueText,concept:(uuid,display),encounter:(uuid,encounterDatetime,visit:(uuid,visitType:(display))))",
    limit: params.limit ?? 100,
  })}`, { schema: results });
  return response.results;
}

export async function getEncountersForEncounterType(patientUuid: string, encounterTypeUuid: string) {
  const response = await bahmniRequest(`/ws/rest/v1/encounter${queryString({
    patient: patientUuid,
    order: "desc",
    encounterType: encounterTypeUuid,
    v: "custom:(uuid,provider,visit:(uuid,startDatetime,stopDatetime),obs:(uuid,concept:(uuid,name),groupMembers:(id,uuid,obsDatetime,value,comment)))",
  })}`, { schema: results });
  return response.results;
}

export async function getDrugOrderDetails(params: { patientUuid: string; includeConceptSet?: string; excludeConceptSet?: string; active?: boolean; patientProgramUuid?: string }) {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/drugOrders/drugOrderDetails${queryString({
    patientUuid: params.patientUuid,
    includeConceptSet: params.includeConceptSet,
    excludeConceptSet: params.excludeConceptSet,
    isActive: params.active,
    patientProgramUuid: params.patientProgramUuid,
  })}`, { schema: records });
}

export async function getDrugRegimen(params: { patientUuid: string; patientProgramUuid?: string; drugs?: string[] }) {
  const search = new URLSearchParams({ patientUuid: params.patientUuid });
  if (params.patientProgramUuid) search.set("patientProgramUuid", params.patientProgramUuid);
  for (const drug of params.drugs ?? []) search.append("drugs", drug);
  return bahmniRequest(`/ws/rest/v1/bahmnicore/drugOGram/regimen?${search}`, { schema: record });
}

export async function getLabOrderResults(params: { patientUuid: string; numberOfVisits?: number | string; visitUuids?: string[] }) {
  const search = new URLSearchParams();
  if (params.visitUuids?.length) params.visitUuids.forEach((uuid) => search.append("visitUuids", uuid));
  else {
    search.set("patientUuid", params.patientUuid);
    if (params.numberOfVisits !== undefined && params.numberOfVisits !== 0) search.set("numberOfVisits", String(params.numberOfVisits));
  }
  return bahmniRequest(`/ws/rest/v1/bahmnicore/labOrderResults?${search}`, { schema: record });
}

function appendMany(search: URLSearchParams, key: string, values: unknown) {
  if (Array.isArray(values)) values.forEach((value) => { if (typeof value === "string" || typeof value === "number") search.append(key, String(value)); });
}

export async function getDiseaseSummaryData(params: { patientUuid: string; visitUuid?: string; config: Record<string, unknown> }) {
  const search = new URLSearchParams({ patientUuid: params.patientUuid });
  if (params.visitUuid) search.set("visit", params.visitUuid);
  for (const key of ["numberOfVisits", "initialCount", "latestCount", "groupBy"] as const) {
    const value = params.config[key]; if (typeof value === "string" || typeof value === "number") search.set(key, String(value));
  }
  appendMany(search, "obsConcepts", params.config.obsConcepts);
  appendMany(search, "drugConcepts", params.config.drugConcepts);
  appendMany(search, "labConcepts", params.config.labConcepts);
  return bahmniRequest(`/ws/rest/v1/bahmnicore/diseaseSummaryData?${search}`, { schema: record });
}

export async function getObservationFlowSheet(params: { patientUuid: string; patientProgramUuid?: string; config: Record<string, unknown> }) {
  const search = new URLSearchParams({ patientUuid: params.patientUuid });
  const conceptSet = params.config.templateName ?? params.config.conceptSet;
  if (typeof conceptSet === "string") search.set("conceptSet", conceptSet);
  const scalarKeys = ["groupByConcept", "orderByConcept", "numberOfVisits", "initialCount", "latestCount", "type", "startDate", "endDate"] as const;
  scalarKeys.forEach((key) => { const value = params.config[key]; if (typeof value === "string" || typeof value === "number") search.set(key === "type" ? "name" : key, String(value)); });
  appendMany(search, "conceptNames", params.config.conceptNames);
  appendMany(search, "formNames", params.config.formNames);
  if (params.patientProgramUuid) search.set("enrollment", params.patientProgramUuid);
  return bahmniRequest(`/ws/rest/v1/bahmnicore/observations/flowSheet?${search}`, { schema: record });
}

export async function getBacteriologyResults(params: { patientUuid: string; patientProgramUuid?: string }) {
  const path = params.patientProgramUuid
    ? `/ws/rest/v1/bacteriology/specimen${queryString({ patientProgramUuid: params.patientProgramUuid, s: "byPatientProgram", v: "full" })}`
    : `/ws/rest/v1/bacteriology/specimen${queryString({ patientUuid: params.patientUuid, name: "BACTERIOLOGY CONCEPT SET", v: "full" })}`;
  return (await bahmniRequest(path, { schema: results })).results;
}

export async function getObservationEncounterUuid(observationUuid: string): Promise<string | undefined> {
  const response = await bahmniRequest(`/ws/rest/v1/obs/${encodeURIComponent(observationUuid)}${queryString({ v: "custom:(uuid,encounter:(uuid))" })}`, { schema: z.unknown() });
  if (!response || typeof response !== "object" || Array.isArray(response)) return undefined;
  const encounter = (response as Record<string, unknown>).encounter;
  if (!encounter || typeof encounter !== "object" || Array.isArray(encounter)) return undefined;
  const uuid = (encounter as Record<string, unknown>).uuid;
  return typeof uuid === "string" ? uuid : undefined;
}

export async function getAssignedBed(patientUuid: string, visitUuid?: string) {
  return bahmniRequest(`/ws/rest/v1/beds${queryString({ patientUuid, visitUuid, s: visitUuid ? "bedDetailsFromVisit" : undefined, v: "full" })}`, { schema: z.unknown() });
}

export async function getAppointments(patientUuid: string, kind: "upcoming" | "past") {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/sql${queryString({ q: kind === "upcoming" ? "bahmni.sqlGet.upComingAppointments" : "bahmni.sqlGet.pastAppointments", v: "full", patientUuid })}`, { schema: records });
}

export async function getGesNotifications(patientIdentifier: string): Promise<DashboardRecord[]> {
  const response = await fetch(`/apinotificacion/ges?patientidentifier=${encodeURIComponent(patientIdentifier)}`, { credentials: "include", headers: { Accept: "application/json" } });
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return [];
  return records.parse(await response.json());
}

export async function discardGesNotification(id: string, practitioner: string): Promise<void> {
  const response = await fetch(`/apinotificacion/ges/${encodeURIComponent(id)}/D?practitioner=${encodeURIComponent(practitioner)}`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`GES discard failed (${response.status})`);
}
