import type { Visit } from "@/types/bahmni";

export const CLOSE_VISIT_PRIVILEGES = ["app:common:closeVisit", "Delete Visits"] as const;

const recordHasValues = (value: unknown): boolean => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);

export function hasActiveAdmission(visitSummary: Record<string, unknown> | undefined): boolean {
  return recordHasValues(visitSummary?.admissionDetails) && !recordHasValues(visitSummary?.dischargeDetails);
}

export interface VisitManagementAction {
  label: "Finalizar visita";
  pendingDischargeClosure: boolean;
}

export function resolveVisitManagementAction(
  visit: Visit,
  selectedVisitUuid: string | undefined,
  visitSummary: Record<string, unknown> | undefined,
  privilegeNames: ReadonlySet<string>,
): VisitManagementAction | undefined {
  const selectedAndActive = visit.uuid === selectedVisitUuid && !visit.stopDatetime;
  const canClose = CLOSE_VISIT_PRIVILEGES.some((privilege) => privilegeNames.has(privilege));
  if (!selectedAndActive || !canClose || visitSummary === undefined) return undefined;

  const admissionRegistered = recordHasValues(visitSummary?.admissionDetails);
  const dischargeRegistered = recordHasValues(visitSummary?.dischargeDetails);
  if (hasActiveAdmission(visitSummary)) return undefined;

  return {
    label: "Finalizar visita",
    pendingDischargeClosure: admissionRegistered && dischargeRegistered,
  };
}

export function registrationVisitUrl(patientUuid: string, visitUuid: string) {
  return {
    pathname: `/registration/patient/${patientUuid}/visit`,
    query: { visitUuid },
  };
}
