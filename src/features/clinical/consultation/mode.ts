import type { Visit } from "@/types/bahmni";
import type { ConsultationMode } from "./types";

export function consultationMode(params: { encounterUuid?: string; retrospectiveDate?: string; programUuid?: string; visitUuid?: string }): ConsultationMode {
  if (params.retrospectiveDate) return "retrospective";
  if (params.encounterUuid && params.encounterUuid !== "active") return "historical";
  if (params.programUuid) return "program";
  return params.visitUuid ? "active-visit" : "without-visit";
}

export function encounterVisitUuid(encounter: Record<string, unknown> | undefined): string | undefined {
  if (!encounter) return undefined;
  if (typeof encounter.visitUuid === "string") return encounter.visitUuid;
  const visit = encounter.visit;
  return visit && typeof visit === "object" && !Array.isArray(visit) && typeof (visit as Record<string, unknown>).uuid === "string"
    ? String((visit as Record<string, unknown>).uuid)
    : undefined;
}

export function baseConsultationVisit(params: {
  visits: Visit[];
  requestedVisitUuid?: string;
  visitLocationUuid?: string;
  encounterUuid?: string;
  retrospectiveDate?: string;
}): Visit | undefined {
  const requested = params.visits.find((visit) => visit.uuid === params.requestedVisitUuid);
  if (requested) return requested;
  if (params.retrospectiveDate || (params.encounterUuid && params.encounterUuid !== "active")) return undefined;
  return params.visits.find((visit) => !visit.stopDatetime && (!params.visitLocationUuid || visit.location?.uuid === params.visitLocationUuid));
}
