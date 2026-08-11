import { z } from "zod";
import type { MedicationSchedulePayload } from "@/features/ipd/ipd-dashboard/treatmentSchedule";
import { bahmniRequest, queryString } from "./http";

const looseRecord = z.record(z.string(), z.unknown());
const looseArray = z.array(looseRecord);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const source = record(value);
  return Array.isArray(source.results) ? source.results : [];
}

export async function saveMedicationSchedule(payload: MedicationSchedulePayload, mode: "create" | "edit"): Promise<Record<string, unknown>> {
  return bahmniRequest(`/ws/rest/v1/ipd/schedule/type/medication${mode === "edit" ? "/edit" : ""}`, {
    method: "POST",
    body: JSON.stringify(payload),
    schema: looseRecord,
  });
}

export async function getPrnScheduledOrderUuids(patientUuid: string, orderUuids: string[]): Promise<Set<string>> {
  if (!orderUuids.length) return new Set();
  const search = new URLSearchParams({ patientUuid, serviceType: "AS_NEEDED_PLACEHOLDER" });
  orderUuids.forEach((uuid) => search.append("orderUuids", uuid));
  const response = await bahmniRequest<unknown>(`/ws/rest/v1/ipd/schedule/type/medication?${search.toString()}`, { cache: "no-store" });
  const requested = new Set(orderUuids);
  return new Set(arrayPayload(response).flatMap((entry) => {
    const item = record(entry);
    const order = record(item.order);
    const uuid = typeof order.uuid === "string" ? order.uuid : typeof item.orderUuid === "string" ? item.orderUuid : undefined;
    return uuid && requested.has(uuid) ? [uuid] : [];
  }));
}

export interface StopScheduledTreatmentPayload {
  drugOrders: Array<Record<string, unknown>>;
  patientUuid: string;
  providers: Array<Record<string, unknown>>;
  visitType: "IPD";
  visitUuid: string;
  encounterTypeUuid: string;
  locationUuid: string;
}

export async function stopScheduledTreatment(payload: StopScheduledTreatmentPayload): Promise<Record<string, unknown>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", {
    method: "POST",
    body: JSON.stringify(payload),
    schema: looseRecord,
  });
}

export async function getEncounterTypeUuid(name: string): Promise<string> {
  const response = await bahmniRequest<Record<string, unknown>>(`/ws/rest/v1/encountertype/${encodeURIComponent(name)}${queryString({ v: "custom:(uuid,name)" })}`, {
    cache: "no-store",
    schema: looseRecord,
  });
  const uuid = typeof response.uuid === "string" ? response.uuid : undefined;
  if (!uuid) throw new Error(`OpenMRS no devolvió el tipo de encuentro ${name}.`);
  return uuid;
}

// Retained as a schema-level contract assertion for tests and future response fields.
export const medicationSlotArraySchema = looseArray;
