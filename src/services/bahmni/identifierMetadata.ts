import { z } from "zod";
import type { PatientFormValues, PatientIdentifierMetadataValues } from "@/types/bahmni";
import { bahmniRequest } from "./http";

const dateValueSchema = z.preprocess((value) => {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return value;
}, z.string().nullish());

const metadataSchema = z.object({
  identifierUuid: z.string(),
  identifierTypeUuid: z.string(),
  value: z.string(),
  voided: z.boolean().nullish(),
  typeCode: z.string().nullish(),
  use: z.string().nullish(),
  systemUri: z.string().nullish(),
  issuerCountryCode: z.string().nullish(),
  issuerOrganization: z.string().nullish(),
  documentType: z.string().nullish(),
  validFrom: dateValueSchema,
  validTo: dateValueSchema,
}).loose();

const metadataListSchema = z.array(metadataSchema);
export type IdentifierMetadataRecord = z.infer<typeof metadataSchema>;

const path = "/ws/rest/v1/eisidentity/identifier-metadata";

export async function getPatientIdentifierMetadata(patientUuid: string): Promise<IdentifierMetadataRecord[]> {
  return bahmniRequest(`${path}?patientUuid=${encodeURIComponent(patientUuid)}`, { schema: metadataListSchema });
}

function desiredMetadata(values: PatientFormValues): Array<{
  identifierUuid?: string;
  identifierTypeUuid: string;
  value: string;
  metadata: PatientIdentifierMetadataValues;
}> {
  return (values.additionalIdentifiers ?? []).flatMap((identifier) => {
    const value = String(identifier.identifier ?? `${identifier.identifierPrefix ?? ""}${identifier.identifierSuffix ?? ""}`).trim();
    return !identifier.voided && value && identifier.metadata
      ? [{ identifierUuid: identifier.uuid, identifierTypeUuid: identifier.identifierTypeUuid, value, metadata: identifier.metadata }]
      : [];
  });
}

function metadataMatches(actual: IdentifierMetadataRecord, expected: ReturnType<typeof desiredMetadata>[number]): boolean {
  const metadata = expected.metadata;
  const sameIdentifier = actual.identifierUuid === expected.identifierUuid
    || (actual.identifierTypeUuid === expected.identifierTypeUuid && actual.value === expected.value);
  return sameIdentifier
    && actual.typeCode === metadata.typeCode
    && actual.use === metadata.use
    && (actual.systemUri ?? "") === (metadata.systemUri ?? "")
    && (actual.issuerCountryCode ?? "") === (metadata.issuerCountryCode ?? "")
    && (actual.issuerOrganization ?? "") === (metadata.issuerOrganization ?? "")
    && (actual.documentType ?? "") === (metadata.documentType ?? "")
    && String(actual.validFrom ?? "").slice(0, 10) === String(metadata.validFrom ?? "").slice(0, 10)
    && String(actual.validTo ?? "").slice(0, 10) === String(metadata.validTo ?? "").slice(0, 10);
}

export async function savePatientIdentifierMetadata(patientUuid: string, values: PatientFormValues): Promise<IdentifierMetadataRecord[]> {
  const desired = desiredMetadata(values);
  if (!desired.length) return [];
  const nativeIdentifiers = await getPatientIdentifierMetadata(patientUuid);
  const identifiers = desired.map((entry) => {
    const native = nativeIdentifiers.find((item) => item.identifierUuid === entry.identifierUuid)
      ?? nativeIdentifiers.find((item) => item.identifierTypeUuid === entry.identifierTypeUuid && item.value === entry.value && item.voided !== true);
    if (!native) throw new Error(`El paciente fue guardado, pero no se encontró el identificador ${entry.value} para registrar sus metadatos EIS.`);
    return { identifierUuid: native.identifierUuid, identifierTypeUuid: native.identifierTypeUuid, value: native.value, voided: false, ...entry.metadata };
  });

  try {
    return await bahmniRequest(path, { method: "POST", schema: metadataListSchema, body: JSON.stringify({ patientUuid, identifiers }) });
  } catch {
    const reconciled = await getPatientIdentifierMetadata(patientUuid);
    if (desired.every((entry) => reconciled.some((actual) => metadataMatches(actual, entry)))) return reconciled;
    throw new Error("El paciente quedó guardado, pero sus metadatos de identificación EIS están pendientes. Revise el registro antes de volver a enviar.");
  }
}

export function metadataValues(record: IdentifierMetadataRecord | undefined): PatientIdentifierMetadataValues | undefined {
  if (!record?.typeCode || !record.use) return undefined;
  return {
    typeCode: record.typeCode,
    use: record.use,
    systemUri: record.systemUri ?? undefined,
    issuerCountryCode: record.issuerCountryCode ?? undefined,
    issuerOrganization: record.issuerOrganization ?? undefined,
    documentType: record.documentType ?? undefined,
    validFrom: record.validFrom?.slice(0, 10),
    validTo: record.validTo?.slice(0, 10),
  };
}
