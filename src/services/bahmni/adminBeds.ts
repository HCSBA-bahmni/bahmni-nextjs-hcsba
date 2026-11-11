import { z } from "zod";
import type { AdminBed, AdminBedLayout, AdminBedTag, AdminBedType, AdminLocation } from "@/features/admin/beds";
import { BahmniApiError, bahmniRequest, queryString } from "./http";

const row = z.record(z.string(), z.unknown());
const list = z.object({ results: z.array(row).default([]) }).loose();
const BED_TAG_DESCRIPTION_PREFIX = "hcsba.bedTag.description.";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function number(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

export function normalizeAdminLocation(value: unknown): AdminLocation {
  const source = object(value); const parent = object(source.parentLocation);
  return { uuid: text(source.uuid), name: text(source.name) || text(source.display), description: text(source.description), parentUuid: text(parent.uuid) || undefined };
}

export function normalizeAdminBed(value: unknown): AdminBed | null {
  const source = object(value); const nested = object(source.bed); const bed = Object.keys(nested).length ? nested : source;
  const uuid = text(bed.bedUuid) || text(bed.uuid);
  if (!uuid) return null;
  const bedType = object(bed.bedType);
  const maps = Array.isArray(bed.bedTagMaps) ? bed.bedTagMaps : Array.isArray(source.bedTagMaps) ? source.bedTagMaps : [];
  return { bedId: number(bed.bedId ?? bed.id), bedUuid: uuid, bedNumber: text(bed.bedNumber) || text(bed.display), rowNumber: Math.max(1, number(source.rowNumber ?? bed.rowNumber, 1)), columnNumber: Math.max(1, number(source.columnNumber ?? bed.columnNumber, 1)), status: text(bed.status), bedType: Object.keys(bedType).length ? { name: text(bedType.name), displayName: text(bedType.displayName) } : undefined, bedTagMaps: maps.map((value) => { const map = object(value); const tag = object(map.bedTag); return { uuid: text(map.uuid), bedTag: { id: number(tag.id), uuid: text(tag.uuid), name: text(tag.name) } }; }).filter((map) => map.uuid && map.bedTag.id) };
}

export async function getAdminLocations(): Promise<AdminLocation[]> {
  const response = await bahmniRequest(`/ws/rest/v1/location${queryString({ tag: "Admission Location", v: "full" })}`, { schema: list, cache: "no-store" });
  return response.results.map(normalizeAdminLocation).filter((location) => location.uuid && location.name);
}

export async function getVisitLocations(): Promise<AdminLocation[]> {
  const response = await bahmniRequest(`/ws/rest/v1/location${queryString({ tag: "Visit Location", v: "full" })}`, { schema: list, cache: "no-store" });
  return response.results.map(normalizeAdminLocation).filter((location) => location.uuid && location.name);
}

export async function getManagingLocationsEnabled(): Promise<boolean> {
  try {
    const response = await bahmniRequest(`/ws/rest/v1/systemsetting${queryString({ v: "custom:(property,value)", q: "bedmanagement.owa." })}`, { schema: list, cache: "no-store" });
    const setting = response.results.find((item) => text(item.property) === "bedmanagement.owa.enableManagingLocations");
    return setting ? String(setting.value).trim().toLowerCase() === "true" : false;
  } catch {
    return false;
  }
}

export async function saveAdminLocation(payload: { uuid?: string; parentLocationUuid: string | null; name: string; description: string }): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/admissionLocation${payload.uuid ? `/${encodeURIComponent(payload.uuid)}` : ""}`, { method: "POST", body: JSON.stringify({ parentLocationUuid: payload.parentLocationUuid, name: payload.name, description: payload.description }) });
}

export async function deleteAdminLocation(uuid: string): Promise<void> { await bahmniRequest(`/ws/rest/v1/admissionLocation/${encodeURIComponent(uuid)}`, { method: "DELETE" }); }

export async function getAdminBedLayout(uuid: string): Promise<AdminBedLayout> {
  const response = await bahmniRequest(`/ws/rest/v1/admissionLocation/${encodeURIComponent(uuid)}${queryString({ v: "full" })}`, { schema: row, cache: "no-store" });
  const mappings = Array.isArray(response.bedLayouts) ? response.bedLayouts : Array.isArray(response.bedLocationMappings) ? response.bedLocationMappings : [];
  const beds = mappings.map(normalizeAdminBed).filter((bed): bed is AdminBed => Boolean(bed));
  const ward = normalizeAdminLocation(response.ward);
  return { ward, beds, rows: Math.max(0, ...mappings.map((item) => number(object(item).rowNumber))), columns: Math.max(0, ...mappings.map((item) => number(object(item).columnNumber))) };
}

export async function saveAdminBedLayout(uuid: string, rows: number, columns: number): Promise<void> { await bahmniRequest(`/ws/rest/v1/admissionLocation/${encodeURIComponent(uuid)}${queryString({ v: "layout" })}`, { method: "POST", body: JSON.stringify({ bedLayout: { row: rows, column: columns } }) }); }

export async function saveAdminBed(payload: { bedUuid?: string; bedNumber: string; bedType: string; row: number; column: number; locationUuid: string }): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/bed${payload.bedUuid ? `/${encodeURIComponent(payload.bedUuid)}` : ""}`, { method: "POST", body: JSON.stringify({ bedNumber: payload.bedNumber, bedType: payload.bedType, row: payload.row, column: payload.column, locationUuid: payload.locationUuid }) });
}
export async function deleteAdminBed(uuid: string): Promise<void> {
  try {
    await bahmniRequest(`/ws/rest/v1/bed/${encodeURIComponent(uuid)}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof BahmniApiError) {
      const detail = `${error.message}\n${JSON.stringify(error.payload ?? "")}`;
      if (detail.includes("BedOccupiedException")) throw new Error("No se puede eliminar una cama ocupada.");
    }
    throw error;
  }
}

export async function getAdminBedTypes(): Promise<AdminBedType[]> {
  const response = await bahmniRequest(`/ws/rest/v1/bedtype${queryString({ v: "full" })}`, { schema: list, cache: "no-store" });
  return response.results.map((value) => ({ uuid: text(value.uuid), name: text(value.name), displayName: text(value.displayName), description: text(value.description) })).filter((item) => item.uuid);
}
export async function saveAdminBedType(payload: Omit<AdminBedType, "uuid"> & { uuid?: string }): Promise<void> { await bahmniRequest(`/ws/rest/v1/bedtype${payload.uuid ? `/${encodeURIComponent(payload.uuid)}` : ""}`, { method: "POST", body: JSON.stringify({ name: payload.name, displayName: payload.displayName, description: payload.description }) }); }
export async function deleteAdminBedType(uuid: string): Promise<void> { await bahmniRequest(`/ws/rest/v1/bedtype/${encodeURIComponent(uuid)}`, { method: "DELETE" }); }

export async function getAdminBedTags(): Promise<AdminBedTag[]> {
  const [response, settings] = await Promise.all([
    bahmniRequest(`/ws/rest/v1/bedTag${queryString({ v: "full" })}`, { schema: list, cache: "no-store" }),
    bahmniRequest(`/ws/rest/v1/systemsetting${queryString({ v: "custom:(uuid,property,value)", q: BED_TAG_DESCRIPTION_PREFIX })}`, { schema: list, cache: "no-store" }),
  ]);
  const descriptions = new Map(settings.results.map((setting) => [text(setting.property).slice(BED_TAG_DESCRIPTION_PREFIX.length), text(setting.value)]));
  return response.results.map((value) => ({ id: number(value.id), uuid: text(value.uuid), name: text(value.name), description: descriptions.get(text(value.uuid)) ?? "" })).filter((item) => item.uuid);
}
async function findBedTagDescriptionSetting(tagUuid: string): Promise<Record<string, unknown> | undefined> {
  const property = `${BED_TAG_DESCRIPTION_PREFIX}${tagUuid}`;
  const response = await bahmniRequest(`/ws/rest/v1/systemsetting${queryString({ v: "custom:(uuid,property,value)", q: property })}`, { schema: list, cache: "no-store" });
  return response.results.find((setting) => text(setting.property) === property);
}
export async function saveAdminBedTag(payload: { uuid?: string; name: string; description: string }): Promise<void> {
  const saved = await bahmniRequest(`/ws/rest/v1/bedTag${payload.uuid ? `/${encodeURIComponent(payload.uuid)}` : ""}`, { method: "POST", body: JSON.stringify({ name: payload.name }), schema: row });
  const tagUuid = payload.uuid ?? text(saved.uuid);
  if (!tagUuid) throw new Error("OpenMRS no devolvió el identificador de la etiqueta de cama.");
  const property = `${BED_TAG_DESCRIPTION_PREFIX}${tagUuid}`;
  const setting = await findBedTagDescriptionSetting(tagUuid);
  await bahmniRequest(`/ws/rest/v1/systemsetting${setting ? `/${encodeURIComponent(text(setting.uuid))}` : ""}`, { method: "POST", body: JSON.stringify({ property, value: payload.description.trim(), description: `Descripción administrativa de la etiqueta de cama ${payload.name}` }) });
}
export async function deleteAdminBedTag(uuid: string): Promise<void> {
  const setting = await findBedTagDescriptionSetting(uuid);
  if (setting?.uuid) await bahmniRequest(`/ws/rest/v1/systemsetting/${encodeURIComponent(text(setting.uuid))}`, { method: "DELETE" });
  await bahmniRequest(`/ws/rest/v1/bedTag/${encodeURIComponent(uuid)}`, { method: "DELETE" });
}
export async function addAdminBedTag(bedId: number, bedTagId: number): Promise<void> { await bahmniRequest("/ws/rest/v1/bedTagMap/", { method: "POST", body: JSON.stringify({ bed: { id: bedId }, bedTag: { id: bedTagId } }) }); }
export async function deleteAdminBedTagMap(uuid: string): Promise<void> { await bahmniRequest(`/ws/rest/v1/bedTagMap/${encodeURIComponent(uuid)}`, { method: "DELETE" }); }
