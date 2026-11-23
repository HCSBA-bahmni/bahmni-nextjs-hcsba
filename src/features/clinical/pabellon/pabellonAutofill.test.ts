import { describe, expect, it } from "vitest";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
import { applySurgeonSpecialty, applyFirstProcedureType, insuranceCareDefault } from "./pabellonAutofill";
const option = (group: string, id: string): PabellonCatalogueOption => ({ sourceId: id, code: id, display: "MISMO NOMBRE", active: true, system: "urn:hcsba:pabellon:catalogue:" + group, relations: [] });
const linked = (group: string, id: string, target: string, parent: string) => ({ ...option(group,id), relations: [{ sourceId: parent, code: parent, display: null, system: "urn:hcsba:pabellon:catalogue:" + target }] });
describe("native form dependent defaults", () => {
  it("uses native MAI/NB codes, not row IDs, and leaves unresolved insurance empty", () => {
    const mai = {...option("care-types","55"),code:"MAI"}, nb = {...option("care-types","77"),code:"NB"};
    expect(insuranceCareDefault("1",[mai,nb])).toBe(mai);
    expect(insuranceCareDefault("0",[mai,nb])).toBe(nb);
    expect(insuranceCareDefault("2",[mai,nb])).toBe(nb);
    expect(insuranceCareDefault(undefined,[mai,nb])).toBeUndefined();
  });
  it("uses the exact physician specialty ID, not a matching name", () => {
    const a = option("specialties","1"), b = option("specialties","2");
    const next = applySurgeonSpecialty(emptyPabellonClinicalDraft(), { mode: "registered", selected: linked("surgeons","9","specialties","2"), name: "" }, [a,b]);
    expect(next.selections.specialties).toEqual([b]);
  });
  it("clears obsolete specialty when the physician has none or changes to free name", () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections.specialties = [option("specialties","1")];
    expect(applySurgeonSpecialty(draft,{mode:"registered",selected:option("surgeons","9"),name:""},[]).selections.specialties).toEqual([]);
    expect(applySurgeonSpecialty(draft,{mode:"manual",selected:null,name:"QA"},[]).selections.specialties).toEqual([]);
  });
  it("selects the first procedure type, preserves manual changes when adding a second, and updates on removal", () => {
    const blank = emptyPabellonClinicalDraft(), a = option("surgery-types","1"), b = option("surgery-types","2");
    const first = { ...blank, selections: { ...blank.selections, procedures: [linked("procedures","10","surgery-types","1")] } };
    const one = applyFirstProcedureType(blank,first,[a,b]); expect(one.selections["surgery-types"]).toEqual([a]);
    const manual = { ...one, selections: { ...one.selections, "surgery-types":[b] } };
    const added = { ...manual, selections: { ...manual.selections, procedures:[...manual.selections.procedures,linked("procedures","11","surgery-types","2")] } };
    expect(applyFirstProcedureType(manual,added,[a,b]).selections["surgery-types"]).toEqual([b]);
    expect(applyFirstProcedureType(added,{...added,selections:{...added.selections,procedures:added.selections.procedures.slice(1)}},[a,b]).selections["surgery-types"]).toEqual([b]);
  });
  it("does not invent surgery type when the relation is absent or unavailable", () => {
    const old = emptyPabellonClinicalDraft(); old.selections["surgery-types"]=[option("surgery-types","2")];
    const next = {...old,selections:{...old.selections,procedures:[option("procedures","10")]}};
    expect(applyFirstProcedureType(old,next,[])).toBe(next);
  });
});
