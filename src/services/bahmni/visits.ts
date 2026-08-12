import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import type { Visit } from "@/types/bahmni";
import type { Form2Observation } from "@/features/forms/form2";

const visitDate = z.union([z.string(), z.number()]).transform((value) => {
  if (typeof value === "string") return value;
  return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
});
const visit = z.object({ uuid: z.string(), startDatetime: visitDate, stopDatetime: visitDate.nullish() }).loose();
const list = z.object({ results: z.array(visit) }).loose();
const visitSummary = z.object({ admissionDetails: z.unknown().nullish(), dischargeDetails: z.unknown().nullish(), visitType: z.unknown().optional(), startDateTime: z.union([z.string(), z.number()]).nullish(), stopDateTime: z.union([z.string(), z.number()]).nullish(), stopDatetime: z.union([z.string(), z.number()]).nullish() }).loose();

export async function getActiveVisits(patientUuid: string): Promise<Visit[]> {
  return getPatientVisits(patientUuid, false);
}

export async function getPatientVisits(patientUuid: string, includeInactive = true): Promise<Visit[]> {
  return (await bahmniRequest(`/ws/rest/v1/visit${queryString({ patient: patientUuid, includeInactive, v: "custom:(uuid,visitType,startDatetime,stopDatetime,location,encounters:(uuid))" })}`, { schema: list })).results as Visit[];
}

export async function getVisitDetails(visitUuid: string): Promise<Visit> {
  return await bahmniRequest(`/ws/rest/v1/visit/${encodeURIComponent(visitUuid)}${queryString({ v: "custom:(uuid,visitType,startDatetime,stopDatetime,location,encounters:(uuid,encounterDatetime,provider:(uuid,display),encounterType:(uuid,display)))" })}`, { schema: visit }) as Visit;
}

export async function startVisit(patientUuid: string, visitTypeUuid: string, locationUuid: string): Promise<Visit> {
  return await bahmniRequest("/ws/rest/v1/visit", { method: "POST", body: JSON.stringify({ patient: patientUuid, visitType: visitTypeUuid, location: locationUuid }), schema: visit }) as Visit;
}

export async function getVisitSummary(visitUuid: string) {
  return await bahmniRequest(`/ws/rest/v1/bahmnicore/visit/summary${queryString({ visitUuid })}`, { schema: visitSummary });
}

export async function endVisit(visitUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/bahmnicore/visit/endVisit${queryString({ visitUuid })}`, { method: "POST", body: JSON.stringify({}) });
}

export function toEncounterWireObservations(observations: Form2Observation[]): Array<Record<string, unknown>> {
  return observations.map(({ concept, groupMembers, ...observation }) => ({
    ...observation,
    // Keep the same minimal concept contract produced by the legacy
    // encounterService.stripExtraConceptInfo implementation.
    concept: { uuid: concept.uuid, name: concept.name },
    groupMembers: toEncounterWireObservations(groupMembers),
  }));
}

interface RegistrationEncounterPayloadParams {
  patientUuid: string;
  locationUuid: string;
  encounterTypeUuid: string;
  visitTypeUuid: string;
  observations?: Form2Observation[];
  providerUuid?: string;
}

export function buildRegistrationEncounterPayload({
  patientUuid,
  locationUuid,
  encounterTypeUuid,
  visitTypeUuid,
  observations = [],
  providerUuid,
}: RegistrationEncounterPayloadParams): Record<string, unknown> {
  return {
    patientUuid,
    locationUuid,
    encounterTypeUuid,
    // This HCSBA backend returns an Apache 500 when it cannot infer the
    // visit type, so preserve it explicitly from the selected active visit.
    visitTypeUuid,
    providers: providerUuid ? [{ uuid: providerUuid }] : [],
    orders: [],
    drugOrders: [],
    observations: toEncounterWireObservations(observations),
    extensions: {},
  };
}

export async function createRegistrationEncounter(params: RegistrationEncounterPayloadParams): Promise<Record<string, unknown>> {
  return await bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", {
    method: "POST",
    body: JSON.stringify(buildRegistrationEncounterPayload(params)),
  });
}
