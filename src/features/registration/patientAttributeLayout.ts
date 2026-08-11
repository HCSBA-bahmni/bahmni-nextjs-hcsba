import type { PatientAttributeSectionConfig, RegistrationConfig } from "@/config-compat/registrationConfig";
import type { PersonAttributeType } from "@/services/bahmni/metadata";

export const localNameAttributeNames = ["givenNameLocal", "middleNameLocal", "familyNameLocal"] as const;

export interface PatientAttributeSection {
  config: PatientAttributeSectionConfig;
  attributes: PersonAttributeType[];
}

export interface PatientAttributeLayout {
  localNames: PersonAttributeType[];
  otherInformation: PersonAttributeType[];
  configuredSections: PatientAttributeSection[];
}

const attributeName = (attribute: PersonAttributeType) => attribute.name ?? attribute.display ?? "";

/** Replica PatientConfig de Angular sin mutar patientInformation. */
export function buildPatientAttributeLayout(attributeTypes: PersonAttributeType[], config?: RegistrationConfig): PatientAttributeLayout {
  const byName = new Map(attributeTypes.map((attribute) => [attributeName(attribute), attribute]));
  const hidden = new Set(config?.hiddenAttributeNames ?? []);
  const localNames = localNameAttributeNames.every((name) => byName.has(name))
    ? localNameAttributeNames.map((name) => byName.get(name)!).filter((attribute) => !hidden.has(attributeName(attribute)))
    : [];
  const reservedLocalNames = new Set<string>(localNameAttributeNames);
  const assigned = new Set<string>();
  const configuredSections = (config?.patientAttributeSections ?? []).flatMap((section) => {
    const attributes = section.attributes.flatMap((name) => {
      const attribute = byName.get(name);
      if (!attribute || hidden.has(name) || reservedLocalNames.has(name)) return [];
      assigned.add(name);
      return [attribute];
    });
    return attributes.length ? [{ config: section, attributes }] : [];
  });
  const otherInformation = attributeTypes.filter((attribute) => {
    const name = attributeName(attribute);
    return Boolean(name) && !hidden.has(name) && !reservedLocalNames.has(name) && !assigned.has(name);
  });
  return { localNames, otherInformation, configuredSections };
}

export function patientAttributeTranslationKey(description: string): string {
  const normalized = description.toUpperCase().replace(/\s\s+/g, " ").replace(/[^A-Z0-9 _]/g, "").trim().replace(/ /g, "_");
  return `PATIENT_ATTRIBUTE_${normalized}`;
}
