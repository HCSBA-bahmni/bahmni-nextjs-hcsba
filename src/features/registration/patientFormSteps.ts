export const PATIENT_FORM_STEPS = [
  { label: "Identificación y datos personales" },
  { label: "Dirección" },
  { label: "Información adicional" },
];

export const LAST_PATIENT_FORM_STEP = PATIENT_FORM_STEPS.length - 1;

const identificationFields = new Set([
  "givenName",
  "middleName",
  "familyName",
  "familyName2",
  "gender",
  "birthDate",
  "birthDateEstimated",
  "birthTime",
  "ageYears",
  "ageMonths",
  "ageDays",
  "identifier",
  "identifierTypeUuid",
  "identifierSourceUuid",
  "identifierPrefix",
  "identifierSuffix",
  "image",
]);

const addressFields = new Set([
  "address1",
  "address2",
  "address3",
  "address4",
  "address5",
  "address6",
  "cityVillage",
  "stateProvince",
  "countyDistrict",
  "country",
  "postalCode",
]);

export function patientFormStepForErrorKeys(keys: string[]): number {
  if (keys.some((key) => identificationFields.has(key.split(".")[0] ?? key))) return 0;
  if (keys.some((key) => addressFields.has(key.split(".")[0] ?? key))) return 1;
  return LAST_PATIENT_FORM_STEP;
}
