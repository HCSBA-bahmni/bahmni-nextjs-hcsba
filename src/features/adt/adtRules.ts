export type AdtActionCode = "ADMIT" | "TRANSFER" | "DISCHARGE" | "UNDO_DISCHARGE";

type VisitSummary = Record<string, unknown> | undefined;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function configuredAdtActionCodes(summary: VisitSummary, hasAssignedBed = false): AdtActionCode[] {
  const discharge = record(summary?.dischargeDetails);
  const visitOpen = summary?.stopDateTime === null || summary?.stopDatetime === null;
  if (Boolean(discharge.uuid) && visitOpen) return ["UNDO_DISCHARGE"];
  if (hasAssignedBed && visitOpen) return ["TRANSFER", "DISCHARGE"];
  return ["ADMIT"];
}

export function dischargeEncounterUuid(summary: VisitSummary): string | undefined {
  const value = record(summary?.dischargeDetails).uuid;
  return typeof value === "string" && value ? value : undefined;
}
