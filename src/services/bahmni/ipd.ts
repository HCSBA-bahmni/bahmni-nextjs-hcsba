import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import { buildRooms, normalizeBedStatus } from "@/features/ipd/domain";
import type { AssignedBed, Bed, BedOccupant, BedTag, BedTagMap, IpdReference, Ward, WardSummary } from "@/features/ipd/types";

const looseObject = z.record(z.string(), z.unknown());
const looseList = z.object({ results: z.array(looseObject).default([]) }).loose();

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numeric(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function reference(value: unknown): IpdReference {
  const source = object(value);
  return { ...source, uuid: text(source.uuid) ?? "", display: text(source.display), name: text(source.name) ?? text(source.display) };
}

function tag(value: unknown): BedTag {
  const source = object(value);
  const id = numeric(source.id, NaN);
  return { ...source, id: Number.isFinite(id) ? id : undefined, uuid: text(source.uuid) ?? "", name: text(source.name) ?? text(source.display) ?? "Tag", display: text(source.display) };
}

function tagMap(value: unknown): BedTagMap {
  const source = object(value);
  return { ...source, uuid: text(source.uuid), bedTag: tag(source.bedTag) };
}

function occupant(value: unknown): BedOccupant {
  const source = object(value);
  const person = object(source.person);
  const preferredName = object(person.preferredName);
  const names = Array.isArray(person.names) ? object(person.names[0]) : {};
  const namesDisplay = [names.givenName, names.middleName, names.familyName, names.familyName2].filter((part): part is string => typeof part === "string" && Boolean(part)).join(" ");
  const personName = text(person.display)
    ?? text(preferredName.display)
    ?? (namesDisplay || undefined);
  const identifiers = Array.isArray(source.identifiers) ? source.identifiers.map((identifier) => object(identifier)) : undefined;
  const identifier = text(source.identifier) ?? identifiers?.map((item) => text(item.identifier)).find(Boolean);
  const sourceReference = reference(source);
  return {
    ...source,
    ...sourceReference,
    display: personName ?? sourceReference.display ?? identifier,
    name: personName ?? sourceReference.name,
    identifier,
    identifiers,
    person,
  };
}

export function normalizeBed(value: unknown): Bed {
  const source = object(value);
  const patients = Array.isArray(source.patients) ? source.patients.map(occupant) : [];
  const singularPatient = object(source.patient);
  const patient = patients[0] ?? (Object.keys(singularPatient).length ? occupant(singularPatient) : undefined);
  const physical = object(source.physicalLocation);
  const parent = object(physical.parentLocation);
  const bedType = object(source.bedType);
  return {
    ...source,
    bedId: numeric(source.bedId ?? source.id),
    bedUuid: text(source.bedUuid) ?? text(source.uuid) ?? "",
    bedNumber: String(source.bedNumber ?? source.display ?? ""),
    status: normalizeBedStatus(source.status),
    rowNumber: Math.max(1, numeric(source.rowNumber, 1)),
    columnNumber: Math.max(1, numeric(source.columnNumber, 1)),
    location: text(source.location) ?? text(physical.name) ?? "Sin habitación",
    physicalLocation: Object.keys(physical).length ? { ...reference(physical), parentLocation: Object.keys(parent).length ? reference(parent) : undefined } : undefined,
    bedType: Object.keys(bedType).length ? { displayName: text(bedType.displayName) ?? text(bedType.display), name: text(bedType.name) } : null,
    bedTagMaps: Array.isArray(source.bedTagMaps) ? source.bedTagMaps.map(tagMap) : [],
    patients,
    patient,
  };
}

export async function getWards(): Promise<WardSummary[]> {
  const response = await bahmniRequest("/ws/rest/v1/admissionLocation/", { schema: looseList, cache: "no-store" });
  return response.results.map((row) => ({ ...row, ward: reference(row.ward ?? row) })).filter((row) => row.ward.uuid);
}

export async function getWard(wardUuid: string): Promise<Ward> {
  const response = await bahmniRequest(`/ws/rest/v1/admissionLocation/${encodeURIComponent(wardUuid)}${queryString({ v: "full" })}`, { schema: looseObject, cache: "no-store" });
  const wardReference = reference(response.ward ?? response);
  const layouts = Array.isArray(response.bedLayouts) ? response.bedLayouts : Array.isArray(response.beds) ? response.beds : [];
  const beds = layouts.map(normalizeBed);
  return { ...response, ...wardReference, beds, rooms: buildRooms(beds) };
}

export async function getBed(bedId: number): Promise<Bed> {
  const response = await bahmniRequest(`/ws/rest/v1/beds/${bedId}${queryString({ v: "full" })}`, { schema: looseObject, cache: "no-store" });
  return normalizeBed(response);
}

export async function getAssignedBed(patientUuid: string, visitUuid?: string): Promise<AssignedBed | null> {
  const response = await bahmniRequest(`/ws/rest/v1/beds${queryString({ patientUuid, visitUuid, s: visitUuid ? "bedDetailsFromVisit" : undefined, v: "full" })}`, { schema: looseList, cache: "no-store" });
  const first = response.results[0];
  if (!first) return null;
  const bed = normalizeBed(first);
  const physical = object(first.physicalLocation);
  const parent = object(physical.parentLocation);
  return {
    wardName: text(parent.display) ?? text(parent.name),
    wardUuid: text(parent.uuid),
    roomName: text(physical.name) ?? text(physical.display) ?? bed.location,
    bedNumber: bed.bedNumber,
    bedId: bed.bedId,
    bedUuid: bed.bedUuid,
  };
}

export async function assignBed(bedId: number, patientUuid: string, encounterUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/beds/${bedId}`, { method: "POST", body: JSON.stringify({ patientUuid, encounterUuid }) });
}

export async function unassignBed(bedId: number, patientUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/beds/${bedId}${queryString({ patientUuid })}`, { method: "DELETE" });
}

export async function updateBedStatus(bedUuid: string, status: "AVAILABLE" | "RESERVED" | "BLOCKED"): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/bed/${encodeURIComponent(bedUuid)}`, { method: "POST", body: JSON.stringify({ status }) });
}

export async function getBedTags(): Promise<BedTag[]> {
  const response = await bahmniRequest(`/ws/rest/v1/bedTag${queryString({ v: "full" })}`, { schema: looseList });
  return response.results.map(tag).filter((item) => item.uuid);
}

export async function addBedTag(bedId: number, bedTagId: number): Promise<BedTagMap> {
  const response = await bahmniRequest("/ws/rest/v1/bedTagMap/", { method: "POST", body: JSON.stringify({ bed: { id: bedId }, bedTag: { id: bedTagId } }), schema: looseObject });
  return tagMap(response);
}

export async function removeBedTag(mapUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/bedTagMap/${encodeURIComponent(mapUuid)}`, { method: "DELETE" });
}

export async function getWardListRows(handler: string, roomName: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/sql${queryString({ q: handler, v: "full", location_name: roomName })}`, { schema: z.array(looseObject), cache: "no-store", signal });
}

const adtConceptRepresentation = "custom:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings),setMembers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings),setMembers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),datatype:(uuid,display,name),units,answers:(uuid,display,name:(display,name),names:(display,name,conceptNameType,locale),mappings))))";

export async function getAdtConceptSet(name: string): Promise<Record<string, unknown> | undefined> {
  const response = await bahmniRequest(`/ws/rest/v1/concept${queryString({ s: "byFullySpecifiedName", name, v: adtConceptRepresentation })}`, { schema: looseList, cache: "no-store" });
  return response.results[0];
}

export async function createAdtEncounter(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", { method: "POST", body: JSON.stringify(payload), schema: looseObject });
}

export async function endVisitAndCreateEncounter(visitUuid: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/visit/endVisitAndCreateEncounter${queryString({ visitUuid })}`, { method: "POST", body: JSON.stringify(payload), schema: looseObject });
}

export async function dischargePatient(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/discharge", { method: "POST", body: JSON.stringify(payload), schema: looseObject });
}

export interface OirsRelationship { id: number; description: string; estado?: boolean }
export async function getOirsRelationships(baseUrl: string): Promise<OirsRelationship[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/parentesco/`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`OIRS parentesco (${response.status})`);
  const payload: unknown = await response.json();
  return (Array.isArray(payload) ? payload : []).flatMap((item) => {
    const source = object(item);
    const id = numeric(source.id, NaN);
    const description = text(source.description);
    return Number.isFinite(id) && description && source.estado !== false ? [{ id, description, estado: source.estado as boolean | undefined }] : [];
  }).sort((left, right) => left.description.localeCompare(right.description, "es"));
}

export async function getOirsBedPatient(baseUrl: string, patientUuid: string, visitUuid: string): Promise<Record<string, unknown> | null> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/data_paciente_acostado/${queryString({ uuid: patientUuid, encounter_id: visitUuid })}`;
  const response = await fetch(endpoint, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`OIRS paciente acostado (${response.status})`);
  const payload: unknown = await response.json();
  return Array.isArray(payload) ? object(payload[0]) : null;
}

export async function saveOirsBedPatient(baseUrl: string, recordId: string | number | undefined, payload: Record<string, unknown>): Promise<void> {
  const root = `${baseUrl.replace(/\/$/, "")}/data_paciente_acostado/`;
  const response = await fetch(recordId ? `${root}${encodeURIComponent(String(recordId))}/` : root, {
    method: recordId ? "PATCH" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`OIRS paciente acostado (${response.status})`);
}

export const ipdQueryKeys = {
  wards: ["ipd", "wards"] as const,
  ward: (uuid?: string) => ["ipd", "ward", uuid] as const,
  wardList: (handler?: string, roomName?: string) => ["ipd", "ward-list", handler, roomName] as const,
  bed: (id?: number) => ["ipd", "bed", id] as const,
  assignedBed: (patientUuid?: string, visitUuid?: string) => ["ipd", "assigned-bed", patientUuid, visitUuid] as const,
  visit: (patientUuid?: string) => ["ipd", "visit", patientUuid] as const,
  patient: (patientUuid?: string) => ["ipd", "patient", patientUuid] as const,
  queue: (id: string, locationUuid?: string) => ["ipd", "queue", id, locationUuid] as const,
  tags: ["ipd", "tags"] as const,
  oirs: (patientUuid?: string, visitUuid?: string) => ["ipd", "oirs", patientUuid, visitUuid] as const,
};
