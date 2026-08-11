import type { Form2Observation } from "@/features/forms/form2";
import type { ConsultationDiagnosis, ConsultationDraft } from "./types";

export interface ConsultationPadObservation {
  key: string;
  group: string;
  label: string;
  value: unknown;
  comment?: string;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const text = (value: unknown): string => typeof value === "string" ? value : "";

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
  : [];

export function diagnosisHasAnswer(diagnosis: ConsultationDiagnosis): boolean {
  return Boolean(diagnosis.codedAnswer?.uuid || diagnosis.freeTextAnswer?.trim());
}

/** Legacy consultationMapper only exposes current-encounter diagnoses and past diagnoses edited now. */
export function consultationPadDiagnoses(draft: ConsultationDraft): ConsultationDiagnosis[] {
  return draft.diagnoses.filter((diagnosis) => (
    !diagnosis.voided
    && diagnosisHasAnswer(diagnosis)
    && (!diagnosis.historical || diagnosis.dirty)
  ));
}

function conceptName(concept: unknown): string {
  const source = object(concept);
  const name = source.name;
  return text(name) || text(object(name).name) || text(source.display) || text(source.shortName);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "object") return Object.keys(object(value)).length > 0;
  return true;
}

function specialConceptUuids(draft: ConsultationDraft): Set<string> {
  return new Set([
    draft.consultationNoteConcept?.uuid,
    draft.labOrderNoteConcept?.uuid,
    draft.followUpConditionConcept?.uuid,
  ].filter((uuid): uuid is string => Boolean(uuid)));
}

function appendObservation(
  observation: Form2Observation | Record<string, unknown>,
  group: string,
  excludedConcepts: Set<string>,
  target: ConsultationPadObservation[],
  seen: Set<string>,
  fallbackIndex: number,
) {
  if (observation.voided === true || observation.inactive === true) return;
  const concept = object(observation.concept);
  const conceptUuid = text(concept.uuid);
  const label = conceptName(concept);
  if (excludedConcepts.has(conceptUuid) || label.toLocaleLowerCase() === "dispensed") return;

  const members = Array.isArray(observation.groupMembers)
    ? observation.groupMembers.filter((item): item is Form2Observation | Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  if (members.length) {
    const memberGroup = label || group;
    members.forEach((member, index) => appendObservation(member, memberGroup, excludedConcepts, target, seen, index));
  }

  if (!hasValue(observation.value)) return;
  const key = text(observation.uuid) || text(observation.formFieldPath) || `${group}:${conceptUuid || label}:${fallbackIndex}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ key, group, label, value: observation.value, comment: text(observation.comment) || undefined });
}

/** Returns only observations that belong to the encounter being edited, not longitudinal patient data. */
export function consultationPadObservations(draft: ConsultationDraft): ConsultationPadObservation[] {
  const result: ConsultationPadObservation[] = [];
  const seen = new Set<string>();
  const excludedConcepts = specialConceptUuids(draft);

  Object.values(draft.forms).forEach((form) => {
    form.observations.forEach((observation, index) => appendObservation(observation, form.formName, excludedConcepts, result, seen, index));
  });

  records(draft.rawEncounter?.observations).forEach((observation, index) => {
    appendObservation(observation, "Observaciones", excludedConcepts, result, seen, index);
  });
  return result;
}

export function consultationPadHasContent(draft: ConsultationDraft): boolean {
  return consultationPadDiagnoses(draft).length > 0
    || consultationPadObservations(draft).length > 0
    || Boolean(draft.consultationNote?.trim())
    || Boolean(draft.disposition?.code && !draft.disposition.voided)
    || draft.drugOrders.some((order) => order.action !== "DISCONTINUE" && !order.dateStopped);
}
