import type { PersonAttributeType } from "@/services/bahmni/metadata";
const nameOf = (type: PersonAttributeType) => type.name ?? type.display;
export const fonasaRegistrationConcept = "e8200001-0000-4000-8000-000000000001";
export function hasFonasaRegistration(attributes: Record<string, unknown>, types: PersonAttributeType[]): boolean {
  const type = types.find((item) => nameOf(item) === "basicHealthInsurance");
  return Boolean(type && attributes[type.uuid] === fonasaRegistrationConcept);
}
export function registryDetailsErrors(attributes: Record<string, unknown>, types: PersonAttributeType[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const number = types.find((item) => nameOf(item) === "addressNumber");
  const segment = types.find((item) => nameOf(item) === "fonasaSegment");
  if (number) {
    const value = String(attributes[number.uuid] ?? "").trim();
    if (!value || value.toUpperCase() === "NULL" || [...value].length > 20 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) errors[number.uuid] = "Ingrese N° casa/departamento válido (máximo 20 caracteres; admite S/N).";
  }
  if (segment && hasFonasaRegistration(attributes, types) && !["A", "B", "C", "D"].includes(String(attributes[segment.uuid] ?? ""))) errors[segment.uuid] = "Seleccione el tramo FONASA.";
  return errors;
}
