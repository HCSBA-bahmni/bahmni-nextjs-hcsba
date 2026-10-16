import { formatChileRun, normalizeChileRun, validateChileRun } from "@/config-compat/validators";
import { getBahmniErrorTechnicalDetails } from "@/services/bahmni/http";
import type { IdentifierType } from "@/services/bahmni/metadata";
import { runFromForm } from "@/services/mpi/admission";
import type { PatientFormValues } from "@/types/bahmni";

const legacyRunPattern = /^(?:CL)?(?:RUN|RUT)\*([0-9.]+-?[0-9K])$/i;

export interface PreMpiRunAddition {
  run: string;
  legacyIdentifier: string;
}

export function runFromLegacyPrimaryIdentifier(identifier?: string): string | undefined {
  const candidate = legacyRunPattern.exec(identifier?.trim() ?? "")?.[1];
  return candidate && validateChileRun(candidate) ? formatChileRun(candidate) : undefined;
}

export function preMpiRunAddition(
  original: Partial<PatientFormValues>,
  edited: Partial<PatientFormValues>,
  identifierTypes: IdentifierType[],
): PreMpiRunAddition | undefined {
  if (runFromForm(original, identifierTypes)) return undefined;
  const run = runFromForm(edited, identifierTypes);
  const legacyRun = runFromLegacyPrimaryIdentifier(original.identifier);
  const primaryType = identifierTypes.find((type) => type.uuid === original.identifierTypeUuid);
  if (!run || !legacyRun || !original.identifierUuid || !primaryType?.primary) return undefined;
  return normalizeChileRun(run) === normalizeChileRun(legacyRun)
    ? { run: formatChileRun(run), legacyIdentifier: original.identifier ?? "" }
    : undefined;
}

export function institutionalIdentifierSource(identifierTypes: IdentifierType[], identifierTypeUuid: string | undefined, defaultPrefix: string) {
  const primaryType = identifierTypes.find((type) => type.uuid === identifierTypeUuid && type.primary)
    ?? identifierTypes.find((type) => type.primary);
  const source = primaryType?.identifierSources.find((item) => item.prefix === defaultPrefix || item.name === defaultPrefix);
  if (!primaryType || !source) throw new Error(`No está disponible la fuente IDGen ${defaultPrefix} para regularizar la ficha clínica.`);
  return { primaryType, source };
}

export async function generateInstitutionalIdentifier(
  identifierTypes: IdentifierType[],
  identifierTypeUuid: string | undefined,
  defaultPrefix: string,
  generate: (identifierSourceName: string) => Promise<string>,
): Promise<string> {
  const { source } = institutionalIdentifierSource(identifierTypes, identifierTypeUuid, defaultPrefix);
  try { return await generate(source.name ?? defaultPrefix); }
  catch (error) {
    const { status } = getBahmniErrorTechnicalDetails(error);
    throw new Error(`IDGen no pudo generar la nueva ficha HCSBA${status ? ` (HTTP ${status})` : ""}. No se envió la actualización del paciente.`);
  }
}

function suffix(identifier: string, prefix?: string | null): string {
  return prefix && identifier.startsWith(prefix) ? identifier.slice(prefix.length) : identifier;
}

export function existingInstitutionalIdentifier(
  values: PatientFormValues,
  identifierTypes: IdentifierType[],
  defaultPrefix: string,
) {
  const { primaryType, source } = institutionalIdentifierSource(identifierTypes, values.identifierTypeUuid, defaultPrefix);
  return values.additionalIdentifiers?.find((identifier) => identifier.voided !== true
    && identifier.identifierTypeUuid === primaryType.uuid
    && (identifier.identifierSourceUuid === source.uuid || identifier.identifier?.startsWith(source.prefix ?? defaultPrefix)));
}

/**
 * Promotes an existing institutional identifier or installs a newly generated one.
 * The contaminated legacy primary keeps its UUID and becomes a non-preferred alias.
 */
export function migrateLegacyPrimaryIdentifier(
  original: Partial<PatientFormValues>,
  edited: PatientFormValues,
  identifierTypes: IdentifierType[],
  defaultPrefix: string,
  generatedIdentifier?: string,
): PatientFormValues {
  const { primaryType, source } = institutionalIdentifierSource(identifierTypes, original.identifierTypeUuid, defaultPrefix);
  if (!original.identifierUuid || !original.identifier) throw new Error("La ficha histórica no tiene un identificador que se pueda conservar.");
  const existing = existingInstitutionalIdentifier(edited, identifierTypes, defaultPrefix);
  const nextIdentifier = existing?.identifier ?? generatedIdentifier?.trim();
  if (!nextIdentifier) throw new Error("IDGen no devolvió el nuevo número clínico institucional.");
  const remaining = (edited.additionalIdentifiers ?? []).filter((identifier) => (!existing?.uuid || identifier.uuid !== existing.uuid) && identifier.uuid !== original.identifierUuid);
  const historical = {
    uuid: original.identifierUuid,
    identifier: original.identifier,
    identifierTypeUuid: original.identifierTypeUuid ?? primaryType.uuid,
    identifierSourceUuid: original.identifierSourceUuid,
    identifierPrefix: original.identifierPrefix,
    locationUuid: original.locationUuid ?? edited.locationUuid,
    voided: false,
  };
  return {
    ...edited,
    identifierUuid: existing?.uuid,
    identifier: nextIdentifier,
    identifierTypeUuid: primaryType.uuid,
    identifierSourceUuid: source.uuid,
    identifierPrefix: source.prefix ?? defaultPrefix,
    identifierSuffix: suffix(nextIdentifier, source.prefix ?? defaultPrefix),
    additionalIdentifiers: [...remaining, historical],
  };
}
