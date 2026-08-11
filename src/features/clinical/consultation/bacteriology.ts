import type { ConsultationSpecimen } from "./types";
import { displayName, object, records, toConcept } from "./boards/shared";

export interface BacteriologyConceptOption {
  label: string;
  value: NonNullable<ConsultationSpecimen["type"]>;
}

function conceptClassName(value: unknown): string {
  return displayName(object(value)).trim();
}

function preferredConceptName(value: Record<string, unknown>): string {
  const names = records(value.names);
  const shortName = names.find((name) => String(name.conceptNameType ?? "").toUpperCase() === "SHORT");
  return displayName(shortName) || displayName(value);
}

export function bacteriologySampleOptions(source: Record<string, unknown> | undefined): BacteriologyConceptOption[] {
  const sampleSource = records(source?.setMembers).find((member) => displayName(member) === "Specimen Sample Source");
  const seen = new Set<string>();
  return records(sampleSource?.answers).flatMap((answer) => {
    const value = toConcept(answer);
    if (!value?.uuid || seen.has(value.uuid)) return [];
    seen.add(value.uuid);
    return [{ label: preferredConceptName(answer) || value.name || value.uuid, value }];
  });
}

export function bacteriologyConceptSetByClass(source: Record<string, unknown> | undefined, className: string) {
  return records(source?.setMembers).find((member) => conceptClassName(member.conceptClass) === className);
}

export function isOtherSpecimenType(specimen: Pick<ConsultationSpecimen, "type">): boolean {
  return String(specimen.type?.name ?? specimen.type?.display ?? "").trim().toLocaleLowerCase() === "other";
}

function observationHasValue(observation: Record<string, unknown>): boolean {
  const value = observation.value;
  if (value !== undefined && value !== null && value !== "") return true;
  return records(observation.groupMembers).some(observationHasValue);
}

export function isSpecimenEmpty(specimen: ConsultationSpecimen): boolean {
  return !specimen.dateCollected
    && !specimen.type?.uuid
    && !specimen.typeFreeText?.trim()
    && !specimen.identifier?.trim()
    && !(specimen.additionalAttributes ?? []).some(observationHasValue)
    && !(specimen.results ?? []).some(observationHasValue);
}

export function specimenNeedsSave(specimen: ConsultationSpecimen): boolean {
  if (specimen.voided) return Boolean(specimen.uuid);
  return !isSpecimenEmpty(specimen) && Boolean(specimen.dirty || !specimen.uuid);
}
