import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
export interface PabellonSurgeonDraft { mode: "registered" | "manual"; selected: PabellonCatalogueOption | null; name: string }
export type PabellonSurgeonFields = { cirujano: number; nombre_cirujano?: never } | { nombre_cirujano: string; cirujano?: never };
export function emptyPabellonSurgeonDraft(): PabellonSurgeonDraft { return { mode: "registered", selected: null, name: "" }; }
export function updatePabellonSurgeonDraft(draft: PabellonSurgeonDraft, patch: Partial<PabellonSurgeonDraft>): PabellonSurgeonDraft {
  const next = { ...draft, ...patch };
  if (next.mode !== draft.mode) { next.selected = null; next.name = ""; }
  if (next.mode === "registered") next.name = ""; else next.selected = null;
  return next;
}
/** This is a clinical selection, NEVER a login/actor mapping or authorization. */
export function buildPabellonSurgeonFields(draft: PabellonSurgeonDraft): { fields: PabellonSurgeonFields | null; errors: string[] } {
  if (draft.mode === "registered") {
    const selected = draft.selected;
    const id = Number(selected?.sourceId);
    if (draft.name || !selected || selected.system !== "urn:hcsba:pabellon:catalogue:surgeons" || !selected.active ||
        selected.relations.length > 1 || selected.relations.some((relation) => relation.system !== "urn:hcsba:pabellon:catalogue:specialties" || relation.code !== relation.sourceId || relation.display !== null) || selected.code !== selected.sourceId || !/^[1-9][0-9]*$/.test(selected.sourceId) || !Number.isSafeInteger(id) || id > 2147483647) {
      return { fields: null, errors: ["Seleccione un médico del catálogo de Pabellón."] };
    }
    return { fields: { cirujano: id }, errors: [] };
  }
  if (draft.mode !== "manual" || draft.selected || !draft.name.trim() || draft.name.trim().toUpperCase() === "NULL" ||
      [...draft.name].length > 255 || /[\u0000-\u001f\u007f-\u009f]/u.test(draft.name) || Number(draft.name) === 0) {
    return { fields: null, errors: ["Ingrese el nombre del médico (máximo 255 caracteres)."] };
  }
  return { fields: { nombre_cirujano: draft.name.trim() }, errors: [] };
}
