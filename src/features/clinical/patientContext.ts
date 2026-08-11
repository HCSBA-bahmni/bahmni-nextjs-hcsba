export interface ClinicalPatientContext {
  uuid: string;
  name: string;
  identifier: string;
  gender: string;
  birthDate?: string;
  birthDateEstimated?: boolean;
  birthTime?: string;
  age?: number;
  address: string;
  addressFields?: Record<string, string>;
  image: string;
  bloodGroup?: string;
  attributes: Array<{ name: string; label: string; value: string }>;
  additionalIdentifiers?: Array<{ name: string; label: string; value: string }>;
  relationships: Array<{ uuid: string; type: string; personUuid: string; personDisplay: string }>;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.map(record) : [];

export function toClinicalPatientContext(profile: Record<string, unknown>, uuid: string): ClinicalPatientContext {
  const patient = record(profile.patient ?? profile);
  const person = record(patient.person ?? profile.person ?? patient);
  const name = records(person.names)[0] ?? {};
  const identifiers = records(patient.identifiers);
  const identifier = identifiers[0] ?? {};
  const address = records(person.addresses)[0] ?? {};
  const attributes = records(person.attributes).flatMap((attribute) => {
    const type = record(attribute.attributeType);
    const rawValue = attribute.value;
    const value = record(rawValue);
    const display = typeof rawValue === "object" ? value.display ?? value.name ?? value.uuid : rawValue;
    return display === undefined || display === null || display === "" ? [] : [{
      name: String(type.name ?? type.display ?? "Atributo"),
      label: String(type.display ?? type.name ?? "Atributo"),
      value: String(display),
    }];
  });
  const displayName = String(name.display ?? [name.givenName, name.middleName, name.familyName].filter(Boolean).join(" "));
  const displayAddress = [address.address1, address.address2, address.cityVillage, address.countyDistrict].filter(Boolean).join(", ");
  const relationships = records(profile.relationships).flatMap((relationship) => {
    const personA = record(relationship.personA);
    const personB = record(relationship.personB);
    const type = record(relationship.relationshipType);
    const patientIsA = personA.uuid === uuid;
    const related = patientIsA ? personB : personA;
    const relationshipLabel = patientIsA ? type.aIsToB : type.bIsToA;
    if (!related.uuid || !relationshipLabel) return [];
    return [{
      uuid: String(relationship.uuid ?? `${relationshipLabel}-${related.uuid}`),
      type: String(relationshipLabel),
      personUuid: String(related.uuid),
      personDisplay: String(related.display ?? related.name ?? related.uuid),
    }];
  });
  const bloodGroup = attributes.find((attribute) => /blood\s*group|grupo\s*sangu/i.test(`${attribute.name} ${attribute.label}`))?.value;
  return {
    uuid,
    name: displayName,
    identifier: String(identifier.identifier ?? ""),
    gender: String(person.gender ?? ""),
    birthDate: typeof person.birthdate === "string" ? person.birthdate : undefined,
    birthDateEstimated: person.birthdateEstimated === true,
    birthTime: typeof person.birthtime === "string" ? person.birthtime : undefined,
    age: typeof person.age === "number" ? person.age : undefined,
    address: displayAddress,
    addressFields: Object.fromEntries(Object.entries(address).flatMap(([key, value]) =>
      typeof value === "string" && value ? [[key, value]] : [])),
    image: `/openmrs/ws/rest/v1/patientImage?patientUuid=${encodeURIComponent(uuid)}`,
    bloodGroup,
    attributes,
    additionalIdentifiers: identifiers.slice(1).flatMap((additionalIdentifier) => {
      const type = record(additionalIdentifier.identifierType);
      const value = additionalIdentifier.identifier;
      return value === undefined || value === null || value === "" ? [] : [{
        name: String(type.name ?? type.display ?? "Identificador"),
        label: String(type.display ?? type.name ?? "Identificador"),
        value: String(value),
      }];
    }),
    relationships,
  };
}
