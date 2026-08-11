import { DateTime } from "luxon";
import type { PatientFormValues } from "@/types/bahmni";
import { birthDateFromAge } from "./age";

export interface PatientProfilePayload {
  patient: { person: Record<string, unknown>; identifiers: Array<Record<string, unknown>>; uuid?: string };
  relationships: Array<Record<string, unknown>>;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== undefined && item !== null)) as T;
}

export function estimatedBirthDate(ageYears: number, ageMonths = 0, ageDays = 0, now: DateTime<boolean> = DateTime.local()): string {
  return birthDateFromAge({ years: ageYears, months: ageMonths, days: ageDays }, now);
}

export function toPatientProfilePayload(values: PatientFormValues): PatientProfilePayload {
  const hasEstimatedAge = values.ageYears !== undefined || values.ageMonths !== undefined || values.ageDays !== undefined;
  const birthdate = values.birthDate || (hasEstimatedAge ? estimatedBirthDate(values.ageYears ?? 0, values.ageMonths ?? 0, values.ageDays ?? 0) : undefined);
  const primaryIdentifiers = values.identifier || values.identifierSourceUuid ? [{
    ...(values.identifierUuid ? { uuid: values.identifierUuid } : {}),
    identifier: values.identifier || undefined,
    identifierSourceUuid: values.identifierSourceUuid,
    identifierPrefix: values.identifierPrefix,
    identifierType: values.identifierTypeUuid,
    preferred: true,
    voided: false,
  }] : [];
  const additionalIdentifiers = (values.additionalIdentifiers ?? []).flatMap((identifier) => {
    const value = identifier.identifier || (identifier.identifierPrefix || identifier.identifierSuffix
      ? `${identifier.identifierPrefix ?? ""}${identifier.identifierSuffix ?? ""}`
      : undefined);
    if (!value && !identifier.uuid && !identifier.identifierSourceUuid) return [];
    return [{
      ...(identifier.uuid ? { uuid: identifier.uuid } : {}),
      identifier: value,
      identifierSourceUuid: identifier.identifierSourceUuid,
      identifierPrefix: identifier.identifierPrefix,
      identifierType: identifier.identifierTypeUuid,
      preferred: false,
      voided: identifier.voided ?? Boolean(identifier.uuid && !value),
    }];
  });
  const identifiers = [...primaryIdentifiers, ...additionalIdentifiers];
  const attributes = Object.entries(values.attributes).flatMap(([attributeType, value]) => {
    const uuid = values.attributeUuids?.[attributeType];
    if (value === "" || value === undefined || value === null) return uuid ? [{ uuid, attributeType: { uuid: attributeType }, value: "", voided: true }] : [];
    return [{ ...(uuid ? { uuid } : {}), attributeType: { uuid: attributeType }, value: String(value), voided: false }];
  });
  const person = compact({
    uuid: values.uuid,
    names: [{ ...(values.nameUuid ? { uuid: values.nameUuid } : {}), givenName: values.givenName, middleName: values.middleName, familyName: values.familyName, display: `${values.givenName}${values.familyName ? ` ${values.familyName}` : ""}`, preferred: Boolean(values.uuid) }],
    gender: values.gender,
    birthdate,
    birthdateEstimated: values.birthDateEstimated ?? (!values.birthDate && hasEstimatedAge),
    birthtime: values.birthTime ? `${birthdate}T${values.birthTime}:00` : undefined,
    dead: values.dead ?? false,
    deathDate: values.deathDate,
    causeOfDeath: values.causeOfDeathUuid ?? "",
    addresses: [compact({ uuid: values.addressUuid, preferred: true, address1: values.address1, address2: values.address2, address3: values.address3, address4: values.address4, address5: values.address5, address6: values.address6, cityVillage: values.cityVillage, stateProvince: values.stateProvince, countyDistrict: values.countyDistrict, country: values.country, postalCode: values.postalCode })],
    attributes,
  });
  return {
    patient: { ...(values.uuid ? { uuid: values.uuid } : {}), person, identifiers },
    relationships: values.relationships.map((relationship) => ({ ...(relationship.relationshipUuid ? { uuid: relationship.relationshipUuid } : {}), relationshipType: { uuid: relationship.relationshipTypeUuid }, personB: { uuid: relationship.personUuid }, voided: relationship.voided ?? false })),
  };
}

export function withPatientUuid(payload: PatientProfilePayload, uuid: string): PatientProfilePayload {
  return { ...payload, patient: { ...payload.patient, uuid, person: { ...payload.patient.person, uuid } } };
}
