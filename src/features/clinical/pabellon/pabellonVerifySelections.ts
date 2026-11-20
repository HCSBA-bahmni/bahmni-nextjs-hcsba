import { getPabellonCatalogue, mergePabellonCataloguePages, type PabellonCatalogueName, type PabellonCatalogueOption, type PabellonCataloguePage } from "@/services/bahmni/pabellonCatalogues";
import type { PabellonSubmissionInput } from "@/services/bahmni/pabellonSubmission";
import type { PabellonClinicalDraft } from "./pabellonClinicalDraft";
import type { PabellonSurgeonDraft } from "./pabellonSurgeonDraft";

const fields: Partial<Record<PabellonCatalogueName, string>> = {
  theatres: "id_pabellon", specialties: "id_especialidad", "surgery-types": "tipo_cirugia_id", "care-types": "tipo_atencion_cirugia_id",
  "patient-priorities": "id_prioridad_paciente", "priority-types": "tipo_prioridad_id", "admission-services": "servicio_ingreso_id",
  "surgical-approaches": "id_via_abordaje", procedures: "plan_quirurgico", asa: "asa_id", "biopsy-types": "tipo_biopsia_id",
  "clinical-services": "servicio_origen_id", "preoperative-assessments": "evaluacion_preoperatoria", "blood-samples": "muestra_sangre_id",
  "blood-groups": "grupo_sanguineo_id", "prior-hospitalization-days": "id_prev_hosp_dias", "approach-types": "id_tipo_via",
  "destination-services": "servicio_cama_salida_id", priorities: "prioridad_id",
};
export class PabellonSelectionChangedError extends Error {
  constructor() { super("Cambió un catálogo de Pabellón o una opción dejó de estar vigente. Revise y vuelva a seleccionar las opciones antes de continuar."); }
}
const same = (a: PabellonCatalogueOption, b: PabellonCatalogueOption) => a.sourceId === b.sourceId && a.system === b.system && a.code === b.code && a.display === b.display && a.active === b.active && JSON.stringify(a.relations) === JSON.stringify(b.relations);
/** Read-only validation; catches old QA drafts and changed/inactive source options.
 * At most four concurrent GETs. Never writes, retries automatically or caches PHI. */
export async function verifyPabellonSelections(draft: PabellonClinicalDraft, surgeon: PabellonSurgeonDraft, input: PabellonSubmissionInput, signal: AbortSignal) {
  const checks: { group: PabellonCatalogueName; items: PabellonCatalogueOption[]; query: string }[] = [];
  const add = (group: PabellonCatalogueName, item: PabellonCatalogueOption) => {
    const query = group === "procedures" ? item.code : item.display;
    const existing = checks.find((check) => check.group === group && check.query === query);
    if (existing) { if (!existing.items.some((value) => same(value, item))) existing.items.push(item); }
    else checks.push({ group, query, items: [item] });
  };
  for (const [group, field] of Object.entries(fields)) {
    const value = input.clinical[field];
    const ids = new Set((Array.isArray(value) ? value : typeof value === "number" ? [value] : []).map(String));
    if (!ids.size) continue;
    if (group === "blood-groups" && ids.size === 1 && ids.has("0")) continue;
    const selected = draft.selections[group as keyof typeof draft.selections].filter((item) => ids.has(item.sourceId));
    if (selected.length !== ids.size) throw new PabellonSelectionChangedError();
    for (const item of selected) add(group as PabellonCatalogueName, item);
  }
  if (surgeon.mode === "registered" && surgeon.selected && input.clinical.cirujano === Number(surgeon.selected.sourceId)) add("surgeons", surgeon.selected);
  let index = 0;
  async function worker() {
    while (index < checks.length) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const check = checks[index++]!; const pages: PabellonCataloguePage[] = []; const seen = new Set<string>();
      for (let page = 0; page < 200; page++) {
        const result = await getPabellonCatalogue(check.group, { search: check.query, limit: 100, cursor: pages.at(-1)?.nextCursor ?? undefined, signal });
        if (result.catalogue !== check.group) throw new PabellonSelectionChangedError();
        pages.push(result); const options = mergePabellonCataloguePages(pages);
        if (check.items.every((item) => options.some((current) => same(current, item)))) break;
        if (!result.nextCursor || seen.has(result.nextCursor) || page === 199) throw new PabellonSelectionChangedError();
        seen.add(result.nextCursor);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(checks.length, 4) }, worker));
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
