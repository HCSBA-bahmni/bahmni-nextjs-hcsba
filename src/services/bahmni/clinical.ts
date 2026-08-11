import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import { normalizeClinicalPatient } from "@/features/clinical/patientSearch";
import type { PatientSearchResult } from "@/types/bahmni";

const looseRecord = z.record(z.string(), z.unknown());
const looseRecords = z.array(looseRecord);
const results = z.object({ results: looseRecords.default([]) }).loose();
const fhirBundle = z.object({ entry: z.array(z.object({ resource: looseRecord }).loose()).default([]) }).loose();

export type ClinicalRecord = z.infer<typeof looseRecord>;

const clinicalPatientSearch = z.object({
  pageOfResults: looseRecords.optional(),
  results: looseRecords.optional(),
  totalCount: z.number().optional(),
}).loose();

export async function getClinicalQueuePatients(params: {
  handler: string;
  locationUuid?: string;
  providerUuid?: string;
  additionalParams?: string;
  searchColumns?: string[];
}): Promise<PatientSearchResult[]> {
  const response = await bahmniRequest(`/ws/rest/v1/bahmnicore/sql${queryString({
    q: params.handler,
    v: "full",
    location_uuid: params.locationUuid,
    provider_uuid: params.providerUuid,
    additionalParams: params.additionalParams,
  })}`, { schema: looseRecords });
  return response.map((patient) => normalizeClinicalPatient(patient, params.searchColumns));
}

export async function searchAllClinicalPatients(params: {
  query: string;
  locationUuid?: string;
  filterOutAttribute?: { attrName?: string; attrValue?: string };
}): Promise<PatientSearchResult[]> {
  const response = await bahmniRequest(`/ws/rest/v1/bahmni/search/patient/lucene${queryString({
    filterOnAllIdentifiers: true,
    q: params.query,
    startIndex: 0,
    identifier: params.query,
    loginLocationUuid: params.locationUuid,
    attributeToFilterOut: params.filterOutAttribute?.attrName,
    attributeValueToFilterOut: params.filterOutAttribute?.attrValue,
  })}`, { schema: clinicalPatientSearch });
  return (response.pageOfResults ?? response.results ?? []).map((patient) => normalizeClinicalPatient(patient));
}

export async function getPatientDiagnoses(patientUuid: string, visitUuid?: string): Promise<ClinicalRecord[]> {
  return await bahmniRequest(`/ws/rest/v1/bahmnicore/diagnosis/search${queryString({ patientUuid, visitUuid })}`, { schema: looseRecords });
}

export async function getPatientObservations(params: {
  patientUuid: string;
  conceptNames?: string[];
  scope?: string;
  numberOfVisits?: number | string;
  visitUuid?: string;
  obsIgnoreList?: string[];
}): Promise<ClinicalRecord[]> {
  const search = new URLSearchParams();
  for (const concept of params.conceptNames ?? []) search.append("concept", concept);
  for (const ignored of params.obsIgnoreList ?? []) search.append("obsIgnoreList", ignored);
  if (params.visitUuid) {
    search.set("visitUuid", params.visitUuid);
    if (params.scope) search.set("scope", params.scope);
  } else {
    search.set("patientUuid", params.patientUuid);
    if (params.numberOfVisits !== undefined) search.set("numberOfVisits", String(params.numberOfVisits));
    if (params.scope) search.set("scope", params.scope);
  }
  return await bahmniRequest(`/ws/rest/v1/bahmnicore/observations?${search.toString()}`, { schema: looseRecords });
}

export async function getPatientAllergies(patientUuid: string): Promise<ClinicalRecord[]> {
  const bundle = await bahmniRequest(`/ws/fhir2/R4/AllergyIntolerance${queryString({ patient: patientUuid, _summary: "data" })}`, { schema: fhirBundle });
  return bundle.entry.map((entry) => entry.resource);
}

export async function getPatientConditionHistory(patientUuid: string): Promise<ClinicalRecord[]> {
  return await bahmniRequest(`/ws/rest/emrapi/conditionhistory${queryString({ patientUuid })}`, { schema: looseRecords });
}

export async function getPatientPrograms(patientUuid: string): Promise<ClinicalRecord[]> {
  return (await bahmniRequest(`/ws/rest/v1/bahmniprogramenrollment${queryString({ patient: patientUuid, v: "full" })}`, { schema: results })).results;
}
