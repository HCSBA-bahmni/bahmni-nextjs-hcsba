import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import { getEncounterConfiguration } from "./metadata";
import type { ClinicalConceptReference, ConsultationCondition } from "@/features/clinical/consultation/types";

const recordSchema = z.record(z.string(), z.unknown());
const recordListSchema = z.object({ results: z.array(recordSchema).default([]) }).loose();
const encounterSummaryListSchema = z.object({
  results: z.array(z.object({
    uuid: z.string(),
    encounterDatetime: z.string().optional(),
    voided: z.boolean().optional(),
    visit: z.object({ uuid: z.string() }).loose().optional(),
  }).loose()).default([]),
}).loose();
const referenceSchema = z.object({ uuid: z.string(), display: z.string().optional(), name: z.unknown().optional() }).loose();
const entityMappingsSchema = z.object({ results: z.array(z.object({ mappings: z.array(referenceSchema).default([]) }).loose()).default([]) }).loose();
const conceptSearchSchema = z.union([z.array(recordSchema), recordListSchema]);

function asRecords(value: z.infer<typeof conceptSearchSchema>): Record<string, unknown>[] {
  return Array.isArray(value) ? value : value.results;
}

const stringValue = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/** Normalizes the terminology-search wire format to PrimeReact's autocomplete contract. */
export function normalizeDiagnosisConceptSuggestions(concepts: ReadonlyArray<Record<string, unknown>>): Record<string, unknown>[] {
  return concepts.flatMap((concept) => {
    const uuid = stringValue(concept.conceptUuid) || stringValue(concept.uuid);
    const conceptName = stringValue(concept.conceptName) || stringValue(concept.name);
    const matchedName = stringValue(concept.matchedName) || conceptName;
    if (!uuid || !matchedName) return [];
    const code = stringValue(concept.code);
    const label = `${matchedName}${conceptName && matchedName !== conceptName ? ` → ${conceptName}` : ""}${code ? ` (${code})` : ""}`;
    return [{ ...concept, uuid, conceptUuid: uuid, name: matchedName, matchedName, conceptName: conceptName || matchedName, display: label, label }];
  });
}

export async function getGlobalProperty(property: string): Promise<string> {
  const value = await bahmniRequest<unknown>(`/ws/rest/v1/bahmnicore/sql/globalproperty${queryString({ property })}`);
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const candidate = source.value ?? source[property] ?? source.results;
    if (typeof candidate === "string") return candidate;
  }
  return String(value ?? "");
}

async function mappedEncounterType(entityUuid: string, mappingType: "program_encountertype" | "location_encountertype") {
  const response = await bahmniRequest(`/ws/rest/v1/entitymapping${queryString({ entityUuid, mappingType, s: "byEntityAndMappingType" })}`, { schema: entityMappingsSchema });
  return response.results[0]?.mappings[0];
}

export async function resolveConsultationEncounterType(params: { programUuid?: string; locationUuid?: string }): Promise<ClinicalConceptReference> {
  if (params.programUuid) {
    const program = await mappedEncounterType(params.programUuid, "program_encountertype");
    if (program) return { uuid: program.uuid, display: program.display, name: typeof program.name === "string" ? program.name : undefined };
  }
  if (params.locationUuid) {
    const location = await mappedEncounterType(params.locationUuid, "location_encountertype");
    if (location) return { uuid: location.uuid, display: location.display, name: typeof location.name === "string" ? location.name : undefined };
  }
  const uuid = await getGlobalProperty("bahmni.encounterType.default");
  if (!uuid) throw new Error("No se configuró bahmni.encounterType.default ni un mapping de tipo de encuentro.");
  return bahmniRequest(`/ws/rest/v1/encountertype/${encodeURIComponent(uuid)}`, { schema: referenceSchema }) as Promise<ClinicalConceptReference>;
}

export async function findConsultationEncounter(params: {
  patientUuid: string;
  providerUuid?: string;
  encounterTypeUuid: string;
  locationUuid: string;
  enrollmentUuid?: string;
  encounterDate?: string;
}): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter/find", {
    method: "POST",
    body: JSON.stringify({
      patientUuid: params.patientUuid,
      providerUuids: params.providerUuid ? [params.providerUuid] : null,
      includeAll: true,
      encounterDateTimeFrom: params.encounterDate,
      encounterDateTimeTo: params.encounterDate,
      encounterTypeUuids: [params.encounterTypeUuid],
      patientProgramUuid: params.enrollmentUuid,
      locationUuid: params.locationUuid,
    }),
    schema: recordSchema,
  });
}

/**
 * Resolves one deterministic encounter for the current clinical act.
 *
 * OpenMRS' legacy matcher iterates the visit encounter Set and returns the
 * first matching type. Once duplicate Consultation encounters exist, that
 * order is undefined and the UI can appear to open a new/empty consultation.
 */
export async function findActiveConsultationEncounter(params: {
  patientUuid: string;
  providerUuid?: string;
  encounterTypeUuid: string;
  locationUuid: string;
  enrollmentUuid?: string;
  visitUuid?: string;
  encounterDate?: string;
}): Promise<Record<string, unknown>> {
  if (params.visitUuid && !params.encounterDate) {
    const response = await bahmniRequest(`/ws/rest/v1/encounter${queryString({
      patient: params.patientUuid,
      encounterType: params.encounterTypeUuid,
      order: "desc",
      limit: 100,
      v: "custom:(uuid,encounterDatetime,voided,visit:(uuid))",
    })}`, { schema: encounterSummaryListSchema });
    const latest = response.results
      .filter((encounter) => encounter.voided !== true && encounter.visit?.uuid === params.visitUuid)
      .sort((left, right) => Date.parse(right.encounterDatetime ?? "") - Date.parse(left.encounterDatetime ?? ""))[0];
    if (latest) return getConsultationEncounter(latest.uuid);
  }
  return findConsultationEncounter(params);
}

export async function getConsultationEncounter(encounterUuid: string): Promise<Record<string, unknown>> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/bahmniencounter/${encodeURIComponent(encounterUuid)}${queryString({ includeAll: true })}`, { schema: recordSchema });
}

export async function saveConsultationEncounter(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", { method: "POST", body: JSON.stringify(payload), schema: recordSchema });
}

export function buildConsultationConditionsPayload(patientUuid: string, conditions: ConsultationCondition[]): Array<Record<string, unknown>> {
  return conditions.filter((condition) => condition.onSetDate !== null && !Number.isInteger(condition.onSetDate)).map((condition) => ({
    uuid: condition.uuid,
    patientUuid,
    concept: condition.concept ? {
      uuid: condition.concept.uuid,
      ...(condition.concept.name ? { name: condition.concept.name } : {}),
      ...(typeof condition.concept.shortName === "string" && condition.concept.shortName ? { shortName: condition.concept.shortName } : {}),
    } : undefined,
    conditionNonCoded: condition.conditionNonCoded,
    status: condition.status,
    onSetDate: condition.onSetDate,
    endDate: condition.endDate,
    endReason: condition.endReason,
    additionalDetail: condition.additionalDetail,
    voided: condition.voided,
    voidReason: condition.voidReason,
  }));
}

export async function saveConsultationConditions(patientUuid: string, conditions: ConsultationCondition[]): Promise<Record<string, unknown>[]> {
  const payload = buildConsultationConditionsPayload(patientUuid, conditions);
  return bahmniRequest("/ws/rest/emrapi/condition", { method: "POST", body: JSON.stringify(payload), schema: z.array(recordSchema) });
}

export async function searchDiagnosisConcepts(term: string, locale: string): Promise<Record<string, unknown>[]> {
  if (term.trim().length < 2) return [];
  const concepts = asRecords(await bahmniRequest(`/ws/rest/v1/bahmni/terminologies/concepts${queryString({ term, locale, limit: 20 })}`, { schema: conceptSearchSchema }));
  return normalizeDiagnosisConceptSuggestions(concepts);
}

export async function deleteConsultationDiagnosis(obsUuid: string): Promise<unknown> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/diagnosis/delete${queryString({ obsUuid })}`);
}

export async function searchConcepts(term: string, conceptClasses?: string[]): Promise<Record<string, unknown>[]> {
  if (term.trim().length < 2) return [];
  return (await bahmniRequest(`/ws/rest/v1/concept${queryString({ q: term, v: "custom:(uuid,display,name,datatype,set,conceptClass,answers,mappings,setMembers:(uuid,display,name,datatype,conceptClass))", limit: 20 })}`, { schema: recordListSchema })).results.filter((concept) => {
    if (!conceptClasses?.length) return true;
    const conceptClass = concept.conceptClass as { display?: string; name?: string } | undefined;
    return conceptClasses.includes(conceptClass?.display ?? conceptClass?.name ?? "");
  });
}

const allOrderablesRepresentation = "custom:(uuid,name:(display,uuid,locale),names:(display,conceptNameType,name,locale),set,setMembers:(uuid,name:(display,uuid,locale),names:(display,conceptNameType,name,locale),set,setMembers:(uuid,name:(display,uuid,locale),names:(display,conceptNameType,name,locale),set,conceptClass:(uuid,name,description),setMembers:(uuid,name:(display,uuid,locale),names:(display,conceptNameType,name,locale),set,conceptClass:(uuid,name,description),setMembers:(uuid,name:(display,uuid,locale),names:(display,conceptNameType,name,locale),set,conceptClass:(uuid,name,description))))))";

/** Exact source used by ordersTabInitialization in AngularJS. */
export async function getAllOrderables(): Promise<Record<string, unknown> | undefined> {
  return getConceptByFullySpecifiedName("All Orderables", allOrderablesRepresentation);
}

export async function getConceptByFullySpecifiedName(name: string, representation = "custom:(uuid,name,answers:(uuid,name,mappings),setMembers)"): Promise<Record<string, unknown> | undefined> {
  const response = await bahmniRequest(`/ws/rest/v1/concept${queryString({ s: "byFullySpecifiedName", name, v: representation })}`, { schema: recordListSchema });
  return response.results[0];
}

export async function searchDrugs(q: string, conceptUuid?: string): Promise<Record<string, unknown>[]> {
  if (q.trim().length < 2) return [];
  const response = await bahmniRequest(`/ws/rest/v1/drug${queryString({ q, conceptUuid, s: "ordered", v: "custom:(uuid,strength,drugReferenceMaps,name,dosageForm,concept:(uuid,name,names:(name)))" })}`, { schema: recordListSchema });
  return response.results;
}

export async function getOrderSets(q?: string): Promise<Record<string, unknown>[]> {
  const response = await bahmniRequest(`/ws/rest/v1/bahmniorderset${queryString({ s: "byQuery", q, v: "full" })}`, { schema: recordListSchema });
  return response.results;
}

export async function calculateDrugDose(params: {
  patientUuid: string;
  drugName: string;
  baseDose?: number | null;
  doseUnit?: string;
  orderSetName?: string;
  dosingRule?: string;
  visitUuid?: string;
}): Promise<{ dose: number | null; doseUnit?: string }> {
  if (!params.dosingRule) return { dose: params.baseDose ?? null, doseUnit: params.doseUnit };
  const dosageRequest = JSON.stringify(params);
  const response = await bahmniRequest(`/ws/rest/v1/bahmnicore/calculateDose${queryString({ dosageRequest })}`, { schema: recordSchema });
  const raw = typeof response.value === "number" ? response.value : Number(response.value);
  const rounded = raw <= 0.49 ? raw : Math.round(raw);
  return { dose: Number.isFinite(rounded) ? Math.max(0.1, rounded) : params.baseDose ?? null, doseUnit: typeof response.doseUnit === "string" ? response.doseUnit : params.doseUnit };
}

export async function getOrderFrequencies(): Promise<Record<string, unknown>[]> {
  const response = await bahmniRequest(`/ws/rest/v1/orderfrequency${queryString({ v: "full" })}`, { schema: recordListSchema });
  return response.results;
}

/** Metadata used by AngularJS treatmentConfig before rendering the medication form. */
export async function getDrugOrderConfiguration(): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/config/drugOrders", { schema: recordSchema });
}

/** Exact active-order source resolved by the legacy treatment route. */
export async function getActiveMedicationOrders(params: { patientUuid: string; startDate?: string; endDate?: string }): Promise<Record<string, unknown>[]> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/drugOrders/active${queryString(params)}`, { schema: z.array(recordSchema) });
}

/** Exact visit-history source used by DrugOrderHistoryController. */
export async function getPrescribedMedicationOrders(params: { patientUuid: string; numberOfVisits?: number; includeActiveVisit?: boolean; startDate?: string; endDate?: string }): Promise<Record<string, unknown>[]> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/drugOrders${queryString(params)}`, { schema: z.array(recordSchema) });
}

export async function getCareSettings(): Promise<Record<string, unknown>[]> {
  const response = await bahmniRequest(`/ws/rest/v1/caresetting${queryString({ v: "default" })}`, { schema: recordListSchema });
  return response.results;
}

export async function getDispositionConfiguration(): Promise<{ actions: Record<string, unknown>[]; noteConcept?: Record<string, unknown> }> {
  const [disposition, note] = await Promise.all([
    getConceptByFullySpecifiedName("Disposition", "custom:(uuid,name,answers:(uuid,name,mappings))"),
    getConceptByFullySpecifiedName("Disposition Note", "custom:(uuid,name:(name))"),
  ]);
  return { actions: Array.isArray(disposition?.answers) ? disposition.answers.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [], noteConcept: note };
}

export async function getBacteriologyConceptSet(): Promise<Record<string, unknown> | undefined> {
  return getConceptByFullySpecifiedName("BACTERIOLOGY CONCEPT SET", "custom:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),conceptClass:(uuid,display,name),setMembers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,conceptClass:(uuid,display,name),answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings),setMembers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,conceptClass:(uuid,display,name),answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings),setMembers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,conceptClass:(uuid,display,name),answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings)))))");
}

export async function getMedicationStopReasons(): Promise<Record<string, unknown>[]> {
  const concept = await getConceptByFullySpecifiedName("Medication Stop Reason", "custom:(uuid,name,answers:(uuid,name,mappings))");
  return Array.isArray(concept?.answers) ? concept.answers.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

export async function getConsultationNoteConcepts(): Promise<{ consultation?: Record<string, unknown>; labOrder?: Record<string, unknown>; followUp?: Record<string, unknown> }> {
  const [consultation, labOrder, followUp] = await Promise.all([
    getConceptByFullySpecifiedName("Consultation Note", "custom:(uuid,name:(name),datatype)"),
    getConceptByFullySpecifiedName("Lab Order Notes", "custom:(uuid,name:(name),datatype)"),
    getConceptByFullySpecifiedName("Follow-up Condition", "custom:(uuid,name:(name),datatype)"),
  ]);
  return { consultation, labOrder, followUp };
}

export async function getCdssEnabled(): Promise<boolean> {
  return (await getGlobalProperty("cdss.enable")).toLowerCase() === "true";
}

export async function getCdssAlerts(bundle: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const response = await bahmniRequest(`/ws/rest/v1/cdss${queryString({ service: "medication-order-select" })}`, { method: "POST", body: JSON.stringify(bundle), schema: z.union([z.array(recordSchema), recordSchema]) });
  return Array.isArray(response) ? response : Array.isArray(response.alerts) ? response.alerts as Record<string, unknown>[] : [];
}

export async function generateAdhocTeleconsultationLink(patientUuid: string, provider: string): Promise<Record<string, unknown>> {
  return bahmniRequest(`/ws/rest/v1/adhocTeleconsultation/generateAdhocTeleconsultationLink${queryString({ patientUuid, provider })}`, { schema: recordSchema });
}

export interface ConsultationPatientDocument {
  uuid: string;
  concept: string;
  date?: string;
  comment?: string;
  valueUrl: string;
}

/** Port of encounterService.getEncountersForEncounterType + PatientFileObservationsMapper. */
export async function getConsultationPatientDocuments(patientUuid: string): Promise<ConsultationPatientDocument[]> {
  const configuration = await getEncounterConfiguration();
  const encounterTypeUuid = configuration.encounterTypes["Patient Document"];
  if (!encounterTypeUuid) return [];
  const response = await bahmniRequest(`/ws/rest/v1/encounter${queryString({
    patient: patientUuid,
    order: "desc",
    encounterType: encounterTypeUuid,
    v: "custom:(uuid,provider,visit:(uuid,startDatetime,stopDatetime),obs:(uuid,concept:(uuid,name),groupMembers:(id,uuid,obsDatetime,value,comment)))",
  })}`, { schema: recordListSchema });
  return response.results.flatMap((encounter) => {
    const observations = Array.isArray(encounter.obs) ? encounter.obs.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
    return observations.flatMap((observation) => {
      const concept = observation.concept && typeof observation.concept === "object" ? observation.concept as Record<string, unknown> : {};
      const name = concept.name && typeof concept.name === "object" ? concept.name as Record<string, unknown> : {};
      const members = Array.isArray(observation.groupMembers) ? observation.groupMembers.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
      return members.flatMap((member) => typeof member.uuid === "string" ? [{
        uuid: member.uuid,
        concept: String(name.name ?? concept.display ?? "Documento del paciente"),
        date: typeof member.obsDatetime === "string" ? member.obsDatetime : undefined,
        comment: typeof member.comment === "string" ? member.comment : undefined,
        valueUrl: `/openmrs/ws/rest/v1/obs/${encodeURIComponent(member.uuid)}/value`,
      }] : []);
    });
  }).sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));
}
