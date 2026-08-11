export type AdtAction = "admit" | "transfer" | "discharge";

export interface EncounterPayloadOptions {
  action: AdtAction;
  patientUuid: string;
  locationUuid: string;
  encounterTypeUuid: string;
  visitTypeUuid?: string;
  providerUuid?: string;
  observations?: unknown[];
}

export function buildAdtEncounterPayload(options: EncounterPayloadOptions): Record<string, unknown> {
  return {
    patientUuid: options.patientUuid,
    locationUuid: options.locationUuid,
    encounterTypeUuid: options.encounterTypeUuid,
    ...(options.visitTypeUuid ? { visitTypeUuid: options.visitTypeUuid } : {}),
    providers: options.providerUuid ? [{ uuid: options.providerUuid }] : [],
    observations: (options.observations ?? []).filter((observation) => observation != null),
  };
}

export function encounterTypeName(action: AdtAction): string {
  if (action === "admit") return "ADMISSION";
  if (action === "transfer") return "TRANSFER";
  return "DISCHARGE";
}
