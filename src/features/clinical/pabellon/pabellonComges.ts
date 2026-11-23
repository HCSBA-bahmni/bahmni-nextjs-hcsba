import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import type { PabellonClinicalDraft } from "./pabellonClinicalDraft";

/** Same native policy: match selects P-75; no match does not forbid manual P-75. */
export function applyComgesPriority(draft: PabellonClinicalDraft, match: boolean | undefined, priorities: PabellonCatalogueOption[]): PabellonClinicalDraft {
  if (match !== true) return draft;
  const candidates = priorities.filter(item => item.active && item.sourceId === "4" && item.system === "urn:hcsba:pabellon:catalogue:patient-priorities");
  if (candidates.length !== 1) return draft;
  return { ...draft, selections: { ...draft.selections, "patient-priorities": [candidates[0]!] } };
}
