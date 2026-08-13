import type { Visit } from "@/types/bahmni";

export type AdtAction = "admit" | "transfer" | "discharge";

export interface EncounterPayloadOptions {
  action: AdtAction;
  patientUuid: string;
  locationUuid: string;
  encounterTypeUuid: string;
  visitTypeUuid?: string;
  visitUuid?: string;
  providerUuid?: string;
  observations?: unknown[];
}

export function buildAdtEncounterPayload(options: EncounterPayloadOptions): Record<string, unknown> {
  return {
    patientUuid: options.patientUuid,
    locationUuid: options.locationUuid,
    encounterTypeUuid: options.encounterTypeUuid,
    ...(options.visitTypeUuid ? { visitTypeUuid: options.visitTypeUuid } : {}),
    ...(options.visitUuid ? { visitUuid: options.visitUuid } : {}),
    providers: options.providerUuid ? [{ uuid: options.providerUuid }] : [],
    observations: (options.observations ?? []).filter((observation) => observation != null),
  };
}

export function encounterTypeName(action: AdtAction): string {
  if (action === "admit") return "ADMISSION";
  if (action === "transfer") return "TRANSFER";
  return "DISCHARGE";
}

function visitTypeName(visit: Visit): string | undefined {
  return visit.visitType?.name ?? visit.visitType?.display;
}

export function resolveIpdVisit(visits: Visit[], defaultVisitType: string, hasCurrentBed: boolean): { visit?: Visit; issue?: string; orphanedBed: boolean } {
  if (!hasCurrentBed) {
    if (visits.length > 1) return { issue: "El paciente tiene más de una visita activa. Corrija las visitas duplicadas antes de admitirlo.", orphanedBed: false };
    return { visit: visits[0], orphanedBed: false };
  }
  const ipdVisits = visits.filter((visit) => visitTypeName(visit) === defaultVisitType);
  if (ipdVisits.length === 1) return { visit: ipdVisits[0], orphanedBed: false };
  if (ipdVisits.length === 0) return { issue: "La cama sigue asignada, pero no existe una visita IPD activa. Libere la asignación inconsistente antes de continuar.", orphanedBed: true };
  return { issue: "El paciente tiene más de una visita IPD activa. Corrija las visitas duplicadas antes de continuar.", orphanedBed: false };
}
