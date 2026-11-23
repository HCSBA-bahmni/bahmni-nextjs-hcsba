import { toClinicalPatientContext, type ClinicalPatientContext } from "../patientContext";
import { getPatientProfile } from "@/services/bahmni/patients";
import { PabellonReadError } from "@/services/bahmni/pabellon";
import { searchAddressEntries, type AddressEntry } from "@/services/bahmni/address";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { emptyPabellonContactDraft } from "./pabellonContactDraft";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";

const exact = (value: string) => value.trim().normalize("NFC").toLocaleUpperCase("es");
const usable = (value: string | undefined) => value && exact(value) !== "NULL" ? value.trim() : "";
// Explicit EIS concept identities from the existing registration catalogue.
// These are NOT Personas codes; select its current original option independently.
const insuranceLabels: Record<string, string> = {
  "e8200001-0000-4000-8000-000000000001": "FONASA",
  "e8200001-0000-4000-8000-000000000002": "ISAPRE",
  "e8200001-0000-4000-8000-000000000003": "CAPREDENA",
  "e8200001-0000-4000-8000-000000000004": "DIPRECA",
  "e8200001-0000-4000-8000-000000000005": "SISA",
  "e8200001-0000-4000-8000-000000000096": "NINGUNA",
  "e8200001-0000-4000-8000-000000000099": "DESCONOCIDO",
};
const biologicalSexCodes: Record<string, { code: string; label: string }> = {
  "99dfaa79-d6b4-5a61-9dd8-a9d5a12c977c": { code: "1", label: "Hombre" },
  "ed3601f5-0cd6-51c1-ad4d-0f34226ade65": { code: "2", label: "Mujer" },
};
export function prefillPabellonPatientContact(patient: ClinicalPatientContext, communes: PabellonCatalogueOption[], insurances: PabellonCatalogueOption[], hierarchy: AddressEntry[], sexes: PabellonCatalogueOption[] = []) {
  const draft = emptyPabellonContactDraft();
  const issues: string[] = [];
  const attrs = patient.attributes ?? [];
  const attribute = (name: string) => {
    const matches = attrs.filter((item) => item.name === name);
    return matches.length === 1 ? matches[0] : undefined;
  };
  draft.telephone = usable(attribute("phoneNumber")?.value);
  draft.address = usable(patient.addressFields?.address1);
  // Dedicated native attributes only. address2 is Localidad, NOT a house number.
  draft.addressNumber = usable(attribute("addressNumber")?.value);
  const segment = usable(attribute("fonasaSegment")?.value);
  // The coded biological-sex attribute, never person.gender or genderIdentity.
  const biological = biologicalSexCodes[attribute("biologicalSex")?.valueUuid ?? ""];
  if (biological) {
    const options = sexes.filter((item) => item.system === "urn:hcsba:personas:catalogue:sexes" && item.active && item.code === biological.code && item.display === biological.label);
    if (options.length === 1) draft.sex = options[0]!;
  }
  const communeName = usable(patient.addressFields?.cityVillage);
  const entries = hierarchy.filter((entry) => exact(entry.name) === exact(communeName) && /^COM-[0-9]{5}$/.test(entry.userGeneratedId ?? ""));
  const codes = new Set(entries.map((entry) => String(Number(entry.userGeneratedId!.slice(4)))));
  if (communeName && codes.size === 1) {
    const options = communes.filter((item) => item.system === "urn:hcsba:personas:catalogue:communes" && item.active && codes.has(item.code));
    if (options.length === 1) draft.commune = options[0]!;
  }
  const insurance = attribute("basicHealthInsurance");
  const label = insuranceLabels[insurance?.valueUuid ?? ""];
  if (label) {
    const options = insurances.filter((item) => item.system === "urn:hcsba:personas:catalogue:insurances" && item.active && exact(item.display) === label);
    if (options.length === 1 && (label !== "FONASA" || options[0]!.code === "1")) draft.insurance = options[0]!;
  }
  if (draft.insurance?.code === "1" && ["A", "B", "C", "D"].includes(segment)) draft.insuranceSegment = segment as "A" | "B" | "C" | "D";
  if (!draft.telephone) issues.push("Falta teléfono de contacto en el Registro del paciente.");
  if (!draft.address) issues.push("Falta dirección en el Registro del paciente.");
  if (!draft.addressNumber) issues.push("Falta N° casa/departamento en un campo propio del Registro; no se extrae desde la dirección.");
  if (!draft.commune) issues.push("La comuna del Registro no tiene una correspondencia única y verificada por código territorial.");
  if (!draft.insurance) issues.push("La previsión del Registro no tiene una correspondencia explícita y única con Pabellón.");
  if (draft.insurance?.code === "1" && !draft.insuranceSegment) issues.push("Falta tramo FONASA en el Registro del paciente.");
  if (!draft.sex) issues.push("El sexo biológico del Registro no tiene una correspondencia verificada; seleccione el valor del catálogo de Pabellón. No se sustituye por género administrativo.");
  return { draft, issues };
}
export async function loadPabellonPatientContact(patient: ClinicalPatientContext, signal?: AbortSignal) {
  const profile = await getPatientProfile(patient.uuid, signal);
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const nativePatient = record(profile.patient ?? profile);
  const nativePerson = record(nativePatient.person ?? profile.person ?? nativePatient);
  if (nativePatient.uuid !== patient.uuid || nativePerson.uuid !== patient.uuid || nativePatient.voided === true || nativePerson.voided === true) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  const current = toClinicalPatientContext(profile, patient.uuid);
  const commune = usable(current.addressFields?.cityVillage);
  const [communes, insurances, hierarchy, sexes] = await Promise.allSettled([
    loadPabellonSmallCatalogue("communes", signal),
    loadPabellonSmallCatalogue("insurances", signal),
    commune ? searchAddressEntries("cityVillage", commune, undefined, signal) : Promise.resolve([]),
    loadPabellonSmallCatalogue("sexes", signal),
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const result = prefillPabellonPatientContact(current,
    communes.status === "fulfilled" ? communes.value : [],
    insurances.status === "fulfilled" ? insurances.value : [],
    hierarchy.status === "fulfilled" ? hierarchy.value : [],
    sexes.status === "fulfilled" ? sexes.value : []);
  if (communes.status === "rejected" || hierarchy.status === "rejected") result.issues.push("No se pudo verificar la comuna durante la precarga; selecciónela desde el catálogo de la solicitud.");
  if (insurances.status === "rejected") result.issues.push("No se pudo verificar la previsión durante la precarga; selecciónela desde el catálogo de la solicitud.");
  if (sexes.status === "rejected") result.issues.push("No se pudo verificar el catálogo de sexo durante la precarga; vuelva a consultarlo desde el selector.");
  // A failed master never authorizes a guessed value. Its picker can retry independently.
  // A failed/mismatched native profile still rejects above: identity is not optional.
  return { ...result, patient: current };
}
