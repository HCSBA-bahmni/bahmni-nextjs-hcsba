import { describe, expect, it } from "vitest";
import { applyComgesPriority } from "./pabellonComges";
import { emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
const priority: PabellonCatalogueOption = { system: "urn:hcsba:pabellon:catalogue:patient-priorities", sourceId: "4", code: "4", display: "P-75", active: true, relations: [] };
describe("COMGES priority parity", () => {
  it("selects only the original active P-75 without changing other fields", () => {
    const draft = emptyPabellonClinicalDraft(); draft.diagnosis = "SYNTHETIC";
    const result = applyComgesPriority(draft, true, [priority]);
    expect(result.selections["patient-priorities"]).toEqual([priority]);
    expect(result.diagnosis).toBe("SYNTHETIC");
    expect(draft.selections["patient-priorities"]).toEqual([]);
  });
  it("preserves manual P-75 when no match, just like the current native form", () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections["patient-priorities"] = [priority];
    expect(applyComgesPriority(draft, false, [priority])).toBe(draft);
    expect(applyComgesPriority(draft, undefined, [priority])).toBe(draft);
  });
  it("never fabricates an inactive, absent, duplicated or foreign priority", () => {
    const draft = emptyPabellonClinicalDraft();
    // Deliberately malformed runtime input, normally rejected by the wire schema.
    for (const catalogue of [[], [priority, priority], [{...priority, active: false}], [{...priority, system: "foreign"}]] as PabellonCatalogueOption[][]) {
      expect(applyComgesPriority(draft, true, catalogue)).toBe(draft);
    }
  });
});
