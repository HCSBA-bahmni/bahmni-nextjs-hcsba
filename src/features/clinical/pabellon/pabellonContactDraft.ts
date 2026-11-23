import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";

export interface PabellonContactDraft {
  telephone: string; address: string; addressNumber: string;
  commune: PabellonCatalogueOption | null; insurance: PabellonCatalogueOption | null;
  sex: PabellonCatalogueOption | null;
  insuranceSegment: "" | "A" | "B" | "C" | "D";
}
export interface PabellonCreationPatientDetails {
  telephone: string; address: string; addressNumber: string;
  communeId: number; communeName: string; insuranceCode: number; insuranceName: string; insuranceSegment: string;
  sexCode: number; sexName: string;
}
export function emptyPabellonContactDraft(): PabellonContactDraft {
  return { telephone: "", address: "", addressNumber: "", commune: null, insurance: null, insuranceSegment: "", sex: null };
}
export function updatePabellonContactDraft(draft: PabellonContactDraft, patch: Partial<PabellonContactDraft>): PabellonContactDraft {
  const next = { ...draft, ...patch };
  if (next.insurance?.code !== "1" || next.insurance?.sourceId !== draft.insurance?.sourceId) next.insuranceSegment = "";
  return next;
}
export function buildPabellonPatientDetails(draft: PabellonContactDraft): { details: PabellonCreationPatientDetails | null; errors: string[] } {
  const errors: string[] = [];
  const text = (value: string, max: number) => value.trim() !== "" && value.trim().toUpperCase() !== "NULL" && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  for (const [value, max, label] of [[draft.telephone, 20, "teléfono"], [draft.address, 255, "dirección"], [draft.addressNumber, 20, "número de casa/departamento"]] as const) {
    if (!text(value, max)) errors.push("Ingrese " + label + " válido (máximo " + max + " caracteres).");
  }
  const code = (option: PabellonCatalogueOption | null, group: "communes" | "insurances" | "sexes", minimum: number) => {
    if (!option || option.system !== "urn:hcsba:personas:catalogue:" + group || !option.active || option.relations.length ||
        !/^[1-9][0-9]*$/.test(option.sourceId) || !Number.isSafeInteger(Number(option.sourceId)) ||
        !/^(0|[1-9][0-9]*)$/.test(option.code) || Number(option.code) < minimum || Number(option.code) > 2147483647 ||
        !text(option.display, group === "communes" ? 100 : group === "sexes" ? 20 : 50)) {
      errors.push(group === "communes" ? "Seleccione una comuna institucional válida." : group === "sexes" ? "Seleccione el sexo desde el catálogo de Pabellón." : "Seleccione una previsión institucional válida.");
      return null;
    }
    return Number(option.code);
  };
  const communeId = code(draft.commune, "communes", 1);
  const insuranceCode = code(draft.insurance, "insurances", 0);
  const sexCode = code(draft.sex, "sexes", 1);
  if (insuranceCode === 1 && !["A", "B", "C", "D"].includes(draft.insuranceSegment)) errors.push("Seleccione el tramo FONASA.");
  return { details: errors.length ? null : {
    telephone: draft.telephone.trim(), address: draft.address.trim(), addressNumber: draft.addressNumber.trim(),
    communeId: communeId!, communeName: draft.commune!.display.trim(),
    insuranceCode: insuranceCode!, insuranceName: draft.insurance!.display.trim(),
    insuranceSegment: insuranceCode === 1 ? draft.insuranceSegment : "",
    sexCode: sexCode!, sexName: draft.sex!.display.trim(),
  }, errors };
}
