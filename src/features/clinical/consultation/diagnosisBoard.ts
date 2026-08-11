import type { ClinicalConceptReference, ConsultationCondition, ConsultationDiagnosis } from "./types";

export type ConditionStatus = "ACTIVE" | "HISTORY_OF" | "INACTIVE";

export interface ConditionMergeResult {
  conditions: ConsultationCondition[];
  error?: "already-active" | "date-before-active";
}

/** Mirrors diagnosisController.getAddConditionMethod: terminology codes are namespaced before condition writes. */
export function qualifyTerminologyConcept(concept: ClinicalConceptReference | undefined): ClinicalConceptReference | undefined {
  if (!concept?.uuid || !concept.conceptSystem) return concept;
  const conceptSystem = concept.conceptSystem.replace(/\/+$/u, "");
  if (concept.uuid.startsWith(`${conceptSystem}/`)) return concept;
  return { ...concept, uuid: `${conceptSystem}/${concept.uuid.replace(/^\/+/, "")}` };
}

const timestamp = (value?: string | null): number => {
  if (!value) return Number.NaN;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export function diagnosisName(diagnosis: ConsultationDiagnosis): string {
  const shortName = typeof diagnosis.codedAnswer?.shortName === "string" ? diagnosis.codedAnswer.shortName : undefined;
  return diagnosis.freeTextAnswer
    ?? shortName
    ?? diagnosis.codedAnswer?.name
    ?? diagnosis.codedAnswer?.display
    ?? "";
}

/** Mirrors Condition.displayString from legacy: prefer the localized short name. */
export function conditionName(condition: ConsultationCondition): string {
  const shortName = typeof condition.concept?.shortName === "string" ? condition.concept.shortName : undefined;
  return condition.conditionNonCoded
    ?? shortName
    ?? condition.concept?.name
    ?? condition.concept?.display
    ?? "";
}

export function primaryDiagnosisFirst(diagnoses: ConsultationDiagnosis[]): ConsultationDiagnosis[] {
  return [...diagnoses].sort((left, right) => Number(right.order === "PRIMARY") - Number(left.order === "PRIMARY"));
}

export function conditionsByStatus(conditions: ConsultationCondition[], status: ConditionStatus): ConsultationCondition[] {
  return conditions.filter((condition) => !condition.voided && condition.status === status);
}

export function sameCondition(left: ConsultationCondition, right: ConsultationCondition): boolean {
  if (left.conditionNonCoded || right.conditionNonCoded) {
    return Boolean(left.conditionNonCoded && right.conditionNonCoded && left.conditionNonCoded.trim().toLocaleLowerCase() === right.conditionNonCoded.trim().toLocaleLowerCase());
  }
  return Boolean(left.concept?.uuid && right.concept?.uuid && left.concept.uuid === right.concept.uuid);
}

/** Mirrors diagnosisController.updateOrAddCondition from the AngularJS consultation. */
export function mergeConsultationCondition(
  conditions: ConsultationCondition[],
  candidate: ConsultationCondition,
  today: string,
): ConditionMergeResult {
  const existing = conditions.find((condition) => !condition.voided && sameCondition(condition, candidate));
  const nextCandidate = { ...candidate, voided: false, dirty: true };
  if (!existing) return { conditions: [...conditions, nextCandidate] };

  if (!existing.uuid) {
    return { conditions: conditions.map((condition) => condition.clientId === existing.clientId ? nextCandidate : condition) };
  }
  if (existing.status === "ACTIVE") return { conditions, error: "already-active" };

  const activeSince = timestamp(existing.activeSince);
  const requestedOnset = timestamp(candidate.onSetDate);
  if (Number.isFinite(activeSince) && Number.isFinite(requestedOnset) && requestedOnset < activeSince) {
    return { conditions, error: "date-before-active" };
  }

  return {
    conditions: conditions.map((condition) => condition.clientId === existing.clientId ? {
      ...condition,
      status: candidate.status,
      onSetDate: existing.status === candidate.status ? condition.onSetDate : candidate.onSetDate || today,
      additionalDetail: candidate.additionalDetail,
      dirty: true,
    } : condition),
  };
}

export function conditionFromDiagnosis(diagnosis: ConsultationDiagnosis, clientId: string, today: string): ConsultationCondition {
  return {
    clientId,
    concept: diagnosis.codedAnswer,
    conditionNonCoded: diagnosis.freeTextAnswer,
    status: "ACTIVE",
    onSetDate: today,
    additionalDetail: diagnosis.comments,
    dirty: true,
  };
}

export function canAddDiagnosisAsCondition(diagnosis: ConsultationDiagnosis, conditions: ConsultationCondition[]): boolean {
  if (diagnosis.certainty !== "CONFIRMED" || (!diagnosis.codedAnswer?.uuid && !diagnosis.freeTextAnswer?.trim())) return false;
  const candidate = conditionFromDiagnosis(diagnosis, "candidate", "");
  return !conditions.some((condition) => !condition.voided && condition.status === "ACTIVE" && sameCondition(condition, candidate));
}
