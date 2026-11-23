import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import type { PabellonClinicalDraft } from "./pabellonClinicalDraft";
import type { PabellonSurgeonDraft } from "./pabellonSurgeonDraft";
export function insuranceCareDefault(insuranceCode: string | undefined, careTypes: PabellonCatalogueOption[]) {
  return insuranceCode === undefined ? undefined : careTypes.find((item) => item.code === (insuranceCode === "1" ? "MAI" : "NB"));
}
export function applySurgeonSpecialty(draft: PabellonClinicalDraft, surgeon: PabellonSurgeonDraft, specialties: PabellonCatalogueOption[]): PabellonClinicalDraft {
  const relation = surgeon.selected?.relations.find((item) => item.system === "urn:hcsba:pabellon:catalogue:specialties");
  const specialty = surgeon.mode === "registered" && specialties.find((item) => item.sourceId === relation?.sourceId);
  return { ...draft, selections: { ...draft.selections, specialties: specialty ? [specialty] : [] } };
}
export function applyFirstProcedureType(previous: PabellonClinicalDraft, next: PabellonClinicalDraft, types: PabellonCatalogueOption[]): PabellonClinicalDraft {
  const first = next.selections.procedures[0];
  if (first?.sourceId === previous.selections.procedures[0]?.sourceId) return next;
  const relation = first?.relations.find((item) => item.system === "urn:hcsba:pabellon:catalogue:surgery-types");
  const type = types.find((item) => item.sourceId === relation?.sourceId);
  return type ? { ...next, selections: { ...next.selections, "surgery-types": [type] } } : next;
}
