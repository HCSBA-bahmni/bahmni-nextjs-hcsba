import type { Reference, Visit } from "@/types/bahmni";

export function visitsAtEffectiveLocation(visits: Visit[], effectiveLocations: Array<Reference | null | undefined>, targetLocationUuid?: string): Visit[] {
  if (!targetLocationUuid) return [];
  return visits.filter((visit, index) => (effectiveLocations[index]?.uuid ?? visit.location?.uuid) === targetLocationUuid);
}
