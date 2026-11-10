import { describe, expect, it } from "vitest";
import type { PabellonCatalogueName, PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { buildPabellonClinicalFields as build, emptyPabellonClinicalDraft, updatePabellonClinicalDraft } from "./pabellonClinicalDraft";
const option = (group: PabellonCatalogueName, id = "1"): PabellonCatalogueOption => ({ sourceId: id, code: group === "procedures" ? "2004006" : id, display: "QA " + group, active: true, system: "urn:hcsba:pabellon:catalogue:" + group, relations: [] });
const child = { ...option("approach-types", "2"), relations: [{ sourceId: "1", code: "1", system: "urn:hcsba:pabellon:catalogue:surgical-approaches", display: null }] };
function valid() {
  const draft = emptyPabellonClinicalDraft();
  for (const group of ["theatres", "specialties", "surgery-types", "care-types", "patient-priorities", "admission-services", "surgical-approaches", "procedures"] as const) draft.selections[group] = [option(group)];
  return { ...draft, diagnosis: "QA DIAGNÓSTICO", duration: "02:00", hospitalized: false, priorHospitalization: false, oncology: false, latexAllergy: false, reintervention: false, lateral: false, biopsy: false, bloodProducts: false, destinationBed: false };
}
describe("HIS request rules against the native Pabellón form", () => {
  it("clears every dependent branch without losing independent fields in a full questionnaire", () => {
    let draft = {...valid(),priorHospitalization:true,priorReason:"MOTIVO",lateral:true,side:"bilateral" as const,biopsy:true,bloodProducts:true,destinationBed:true,donor:false,rh:false,bloodDescription:"2 UNIDADES",destinationConditions:"OBS",otherAssessments:"OTRO"};
    for(const group of ["prior-hospitalization-days","biopsy-types","blood-samples","blood-groups","destination-services"] as const) draft.selections[group]=[option(group)];
    draft.selections["preoperative-assessments"]=[{...option("preoperative-assessments"),display:"OTROS"}];
    expect(build(draft,[]).fields).not.toBeNull();
    draft=updatePabellonClinicalDraft(draft,{hospitalized:true,biopsy:false,bloodProducts:false,lateral:false,destinationBed:false,selections:{...draft.selections,"preoperative-assessments":[]}}) as typeof draft;
    expect(build(draft,[]).fields).toMatchObject({hospitalizacion_previa:false,id_prev_hosp_dias:null,motivo_hospitalizacion_previa:"",tipo_biopsia_id:null,tipo_lateralidad:null,muestra_sangre_id:[],grupo_sanguineo_id:0,servicio_cama_salida_id:null,condiciones_prioridad:"",evaluacion_preoperatoria_otros:null,servicio_ingreso_id:1,plan_quirurgico:[1]});
    expect(draft.priorHospitalization).toBeNull();expect(draft.donor).toBeNull();expect(draft.rh).toBeNull();
    expect(draft.medicalEquipment).toBe("NO NECESITO EQUIPOS MEDICOS ESPECIALES");
  });
  it("preserves optional supply narratives and nursing checklist, never kits", () => {
    const draft = {...valid(), medicalEquipment:"EQUIPO\nQA", optionalSupplies:"INSUMO QA"};
    expect(build(draft,[]).fields).toMatchObject({dispositivos_solicitados:"EQUIPO\nQA",insumos_opcionales:"INSUMO QA",checklist_enfermeria:true});
    expect(build(draft,[]).fields).not.toHaveProperty("kit_id");
    expect(build({...draft,medicalEquipment:""},[]).fields?.dispositivos_solicitados).toBe("");
    expect(build({...draft,medicalEquipment:"x".repeat(5001)},[]).fields).toBeNull();
  });
  it("reports combined payload budget before review", () => {
    const result = build({...valid(),medicalEquipment:"x".repeat(4500),optionalSupplies:"y".repeat(4500)},[]);
    expect(result.fields).toBeNull();expect(result.errors.join(" ")).toMatch(/8 KB/);
  });
  it("requires explicit decisions and uses source IDs rather than MAI codes", () => {
    expect(build(emptyPabellonClinicalDraft(), []).fields).toBeNull();
    const result = build(valid(), []);
    expect(result.errors).toEqual([]);
    expect(result.fields).toMatchObject({ plan_quirurgico: [1], paciente_hospitalizado: false, hospitalizacion_previa: false, servicio_ingreso_id: 1, tipo_lateralidad: null });
  });
  it.each(["biopsy", "bloodProducts", "destinationBed"] as const)("requires an explicit Yes/No for %s", (key) => {
    expect(build({ ...valid(), [key]: null }, []).fields).toBeNull();
  });
  it("requires admission service even for ambulatory patients", () => {
    const draft = valid(); draft.selections["admission-services"] = [];
    expect(build(draft, []).fields).toBeNull();
  });
  it("does not require or send the hidden priority/clinical-origin selectors", () => {
    const draft = valid(); draft.selections.priorities = [option("priorities")]; draft.selections["priority-types"] = [option("priority-types")];
    const fields = build(draft, []).fields!;
    expect(fields).not.toHaveProperty("tipo_prioridad_id"); expect(fields).not.toHaveProperty("servicio_origen_id");
    expect(fields.prioridad_id).toBeNull();
  });
  it("clears previous hospitalization when hospitalized, retaining admission service", () => {
    const draft = { ...valid(), priorHospitalization: true, priorReason: "QA" }; draft.selections["prior-hospitalization-days"] = [option("prior-hospitalization-days")];
    const next = updatePabellonClinicalDraft(draft, { hospitalized: true });
    expect(next.priorReason).toBe(""); expect(next.priorHospitalization).toBeNull();
    expect(next.selections["prior-hospitalization-days"]).toEqual([]);
    expect(build(next, []).fields).toMatchObject({ paciente_hospitalizado: true, hospitalizacion_previa: false, servicio_ingreso_id: 1 });
  });
  it("requires days/reason only for previous hospitalization YES", () => {
    const draft = { ...valid(), priorHospitalization: true };
    expect(build(draft, []).fields).toBeNull();
    draft.priorReason = "QA"; draft.selections["prior-hospitalization-days"] = [option("prior-hospitalization-days")];
    expect(build(draft, []).fields?.hospitalizacion_previa).toBe(true);
  });
  it("supports bilateral and clears the hidden laterality", () => {
    const draft = { ...valid(), lateral: true, side: "bilateral" as const };
    expect(build(draft, []).fields?.tipo_lateralidad).toBe("bilateral");
    const next = updatePabellonClinicalDraft(draft, { lateral: false });
    expect(next.side).toBe(""); expect(build(next, []).fields?.tipo_lateralidad).toBeNull();
  });
  it("requires biopsy type only on YES and clears it on NO", () => {
    const draft = { ...valid(), biopsy: true }; expect(build(draft, []).fields).toBeNull();
    draft.selections["biopsy-types"] = [option("biopsy-types")];
    expect(build(draft, []).fields?.tipo_biopsia_id).toBe(1);
    const next = updatePabellonClinicalDraft(draft, { biopsy: false });
    expect(next.selections["biopsy-types"]).toEqual([]); expect(build(next, []).fields?.tipo_biopsia_id).toBeNull();
  });
  it("waits for complete type metadata and requires a child only when the selected route has children", () => {
    expect(build(valid(), undefined).fields).toBeNull();
    expect(build(valid(), []).fields).not.toBeNull();
    expect(build(valid(), [child]).fields).toBeNull();
    const draft = valid(); draft.selections["approach-types"] = [child];
    expect(build(draft, [child]).fields?.id_tipo_via).toBe(2);
    expect(build(draft, []).fields).toBeNull();
    const next = updatePabellonClinicalDraft(draft, { selections: { ...draft.selections, "surgical-approaches": [option("surgical-approaches", "7")] } });
    expect(next.selections["approach-types"]).toEqual([]);
  });
  it("requires OTROS narrative only when OTROS is selected and clears it on removal", () => {
    const draft = valid(); draft.selections["preoperative-assessments"] = [{ ...option("preoperative-assessments"), display: "OTROS" }];
    expect(build(draft, []).fields).toBeNull();
    draft.otherAssessments = "QA";
    expect(build(draft, []).fields?.evaluacion_preoperatoria_otros).toBe("QA");
    const next = updatePabellonClinicalDraft(draft, { selections: { ...draft.selections, "preoperative-assessments": [] } });
    expect(next.otherAssessments).toBe(""); expect(build(next, []).fields?.evaluacion_preoperatoria_otros).toBeNull();
  });
  it("requires only the bed service on YES, not a hidden priority", () => {
    const draft = { ...valid(), destinationBed: true }; expect(build(draft, []).fields).toBeNull();
    draft.selections["destination-services"] = [option("destination-services")];
    expect(build(draft, []).fields).toMatchObject({ servicio_cama_salida_id: 1, prioridad_id: null });
    const next = updatePabellonClinicalDraft(draft, { destinationBed: false });
    expect(next.selections["destination-services"]).toEqual([]); expect(build(next, []).fields?.servicio_cama_salida_id).toBeNull();
  });
  it("requires blood product, group, Rh, donors and narrative only on YES and clears them on NO", () => {
    const draft = { ...valid(), bloodProducts: true, donor: false, rh: false, bloodDescription: "" };
    draft.selections["blood-samples"] = [option("blood-samples")]; draft.selections["blood-groups"] = [option("blood-groups")];
    expect(build(draft, []).fields).toBeNull(); draft.bloodDescription = "QA";
    expect(build(draft, []).fields).toMatchObject({ muestra_sangre_id: [1], grupo_sanguineo_id: 1, rh: false, donante: false });
    const next = updatePabellonClinicalDraft(draft, { bloodProducts: false });
    expect(next.donor).toBeNull(); expect(next.rh).toBeNull();
    expect(build(next, []).fields).toMatchObject({ muestra_sangre_id: [], grupo_sanguineo_id: 0, descripcion_muestra_sangre: "" });
  });
  it.each(["duplicate", "large", "foreign", "inactive", "multiple"])("rejects %s references", (mode) => {
    const draft = valid();
    if (mode === "duplicate") draft.selections.procedures.push(option("procedures"));
    if (mode === "large") draft.selections.procedures[0]!.sourceId = "9007199254740993";
    if (mode === "foreign") draft.selections.procedures[0]!.system = "urn:wrong";
    if (mode === "inactive") Object.assign(draft.selections.procedures[0]!, { active: false });
    if (mode === "multiple") draft.selections.theatres.push(option("theatres", "2"));
    expect(build(draft, []).fields).toBeNull();
  });
  it.each(["00:00", "8:00", "01:60", "24:00:00", "NaN"])("rejects invalid duration %s", (duration) => {
    expect(build({ ...valid(), duration }, []).fields).toBeNull();
  });
});
