import { z } from "zod";
import { BahmniApiError, bahmniRequest, queryString } from "./http";
import type { PatientFormValues, PatientSearchResult } from "@/types/bahmni";
import { toPatientProfilePayload, withPatientUuid } from "@/features/registration/mappers";

const patientResultSchema = z.object({ uuid: z.string() }).loose();
const searchSchema = z.object({ pageOfResults: z.array(patientResultSchema).optional(), results: z.array(patientResultSchema).optional(), totalCount: z.number().optional() }).loose();

export interface SearchPatientsParams {
  q?: string;
  identifier?: string;
  customAttribute?: string;
  patientAttributes?: string[];
  addressFieldName?: string;
  address?: string;
  page?: number;
  pageSize?: number;
  locationUuid?: string;
  filterOnAllIdentifiers?: boolean;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

export function normalizePatientSearchResult(raw: Record<string, unknown>): PatientSearchResult {
  const custom = parseJsonObject(raw.customAttribute);
  const addressValues = parseJsonObject(raw.addressFieldValue);
  const name = String(raw.name ?? raw.personName ?? "").trim().split(/\s+/);
  return {
    ...raw,
    uuid: String(raw.uuid),
    identifier: String(raw.identifier ?? raw.primaryIdentifier ?? ""),
    givenName: String(raw.givenName ?? name.shift() ?? ""),
    middleName: typeof raw.middleName === "string" ? raw.middleName : undefined,
    familyName: String(raw.familyName ?? name.join(" ") ?? ""),
    gender: typeof raw.gender === "string" ? raw.gender : undefined,
    age: typeof raw.age === "number" || typeof raw.age === "string" ? raw.age : undefined,
    birthDate: typeof raw.birthDate === "string" ? raw.birthDate : typeof raw.birthdate === "string" ? raw.birthdate : undefined,
    phoneNumber: String(raw.phoneNumber ?? custom.phoneNumber ?? custom.alternatePhoneNumber ?? ""),
    address: String(raw.address ?? raw.addressFieldValueString ?? Object.values(addressValues).filter((value) => typeof value === "string").join(", ") ?? ""),
    activeVisitUuid: typeof raw.activeVisitUuid === "string" ? raw.activeVisitUuid : undefined,
  };
}

export async function searchPatients(params: SearchPatientsParams): Promise<{ results: PatientSearchResult[]; total: number }> {
  const useLucene = Boolean(params.q || params.identifier);
  const resource = useLucene ? "/ws/rest/v1/bahmni/search/patient/lucene" : "/ws/rest/v1/bahmni/search/patient";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const startIndex = (page - 1) * pageSize;
  const requestSearch = (path: string, fallback = false) => {
    const lucene = path.endsWith("/lucene");
    return bahmniRequest(`${path}${queryString({
    q: params.q || (fallback ? params.customAttribute || params.address : undefined),
    identifier: params.identifier || (lucene && params.q ? params.q : undefined),
    s: lucene ? "byIdOrName" : "byIdOrNameOrVillage",
    addressFieldName: !lucene && !fallback && params.address ? params.addressFieldName : undefined,
    addressFieldValue: !lucene && !fallback ? params.address : undefined,
    customAttribute: params.customAttribute,
    patientAttributes: params.patientAttributes?.join(","),
    startIndex,
    limit: pageSize,
    loginLocationUuid: params.locationUuid,
    filterOnAllIdentifiers: lucene && params.q ? true : params.filterOnAllIdentifiers,
  })}`, { schema: searchSchema });
  };
  let response;
  try { response = await requestSearch(resource); }
  catch (error) {
    if (useLucene || !(error instanceof BahmniApiError) || ![400, 500].includes(error.status)) throw error;
    response = await requestSearch("/ws/rest/v1/bahmni/search/patient/lucene", true);
  }
  const rawResults = (response.pageOfResults ?? response.results ?? []) as Array<Record<string, unknown>>;
  const results = rawResults.map(normalizePatientSearchResult);
  const inferredTotal = startIndex + results.length + (results.length === pageSize ? 1 : 0);
  return { results, total: response.totalCount ?? inferredTotal };
}

export async function getPatientProfile(uuid: string): Promise<Record<string, unknown>> { return bahmniRequest(`/ws/rest/v1/patientprofile/${encodeURIComponent(uuid)}?v=full`); }

export async function savePatient(values: PatientFormValues, jumpAccepted = false): Promise<Record<string, unknown>> {
  const payload = toPatientProfilePayload(values);
  const path = values.uuid ? `/ws/rest/v1/bahmnicore/patientprofile/${encodeURIComponent(values.uuid)}` : "/ws/rest/v1/bahmnicore/patientprofile";
  return bahmniRequest(path, { method: "POST", headers: { "Jump-Accepted": String(jumpAccepted) }, body: JSON.stringify(values.uuid ? withPatientUuid(payload, values.uuid) : payload) });
}

export async function generateIdentifier(identifierSourceName?: string): Promise<string> {
  const result = await bahmniRequest<string | { identifier?: string }>("/ws/rest/v1/idgen", { method: "POST", headers: { Accept: "text/plain" }, body: JSON.stringify({ identifierSourceName: identifierSourceName ?? "" }) });
  return typeof result === "string" ? result : result.identifier ?? "";
}

export async function uploadPatientImage(patientUuid: string, image: string): Promise<void> {
  const base64EncodedImage = image.replace(/^data:image\/[^;]+;base64,/, "");
  await bahmniRequest("/ws/rest/v1/personimage/", { method: "POST", body: JSON.stringify({ person: { uuid: patientUuid }, base64EncodedImage }) });
}
