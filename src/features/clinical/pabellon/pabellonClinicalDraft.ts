import { pabellonClinicalCatalogueNames as pabellonCatalogueNames, type PabellonClinicalCatalogueName as PabellonCatalogueName, type PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";

export interface PabellonClinicalDraft {
  selections: Record<PabellonCatalogueName, PabellonCatalogueOption[]>;
  diagnosis: string;
  duration: string;
  hospitalized: boolean | null;
  priorHospitalization: boolean | null;
  oncology: boolean | null;
  latexAllergy: boolean | null;
  reintervention: boolean | null;
  lateral: boolean | null;
  biopsy: boolean | null;
  bloodProducts: boolean | null;
  destinationBed: boolean | null;
  side: "" | "izquierda" | "derecha" | "bilateral";
  priorReason: string;
  additionalPlan: string;
  otherAssessments: string;
  destinationConditions: string;
  bloodDescription: string;
  donor: boolean | null;
  rh: boolean | null;
  medicalEquipment: string;
  optionalSupplies: string;
}
export function emptyPabellonClinicalDraft(): PabellonClinicalDraft {
  return {
    selections: pabellonCatalogueNames.reduce((all, name) => { all[name] = []; return all; }, {} as PabellonClinicalDraft["selections"]),
    diagnosis: "", duration: "00:00", hospitalized: null, priorHospitalization: null, oncology: null,
    latexAllergy: null, reintervention: null, lateral: null, biopsy: null, bloodProducts: null, destinationBed: null, side: "", priorReason: "",
    additionalPlan: "", otherAssessments: "", destinationConditions: "", bloodDescription: "", donor: null, rh: null,
    medicalEquipment: "NO NECESITO EQUIPOS MEDICOS ESPECIALES", optionalSupplies: "NO NECESITO INSUMOS OPCIONALES A LOS KIT/S SELECCIONADO/S",
  };
}
/** Clear dependent fields immediately; hidden values must never leak into a send. */
export function updatePabellonClinicalDraft(draft: PabellonClinicalDraft, patch: Partial<PabellonClinicalDraft>): PabellonClinicalDraft {
  const next = { ...draft, ...patch, selections: { ...draft.selections, ...patch.selections } };
  if (next.hospitalized !== false) next.priorHospitalization = null;
  if (next.hospitalized !== false || next.priorHospitalization !== true) {
    next.selections["prior-hospitalization-days"] = []; next.priorReason = "";
  }
  if (next.lateral !== true) next.side = "";
  if (next.selections["surgical-approaches"][0]?.sourceId !== draft.selections["surgical-approaches"][0]?.sourceId) next.selections["approach-types"] = [];
  if (next.biopsy !== true) next.selections["biopsy-types"] = [];
  if (next.destinationBed !== true) { next.selections["destination-services"] = []; next.destinationConditions = ""; }
  next.selections.priorities = []; next.selections["priority-types"] = [];
  if (next.bloodProducts !== true) {
    next.selections["blood-samples"] = [];
    next.selections["blood-groups"] = []; next.bloodDescription = ""; next.donor = null; next.rh = null;
  }
  if (!next.selections["preoperative-assessments"].some((item) => item.display.trim().toLocaleUpperCase("es") === "OTROS")) next.otherAssessments = "";
  return next;
}
const idFields: Partial<Record<PabellonCatalogueName, string>> = {
  theatres: "id_pabellon", specialties: "id_especialidad", "surgery-types": "tipo_cirugia_id",
  "care-types": "tipo_atencion_cirugia_id", "patient-priorities": "id_prioridad_paciente",
  "priority-types": "tipo_prioridad_id", "admission-services": "servicio_ingreso_id",
  "surgical-approaches": "id_via_abordaje", "approach-types": "id_tipo_via",
  asa: "asa_id", "biopsy-types": "tipo_biopsia_id", "clinical-services": "servicio_origen_id",
  "destination-services": "servicio_cama_salida_id", priorities: "prioridad_id",
  "prior-hospitalization-days": "id_prev_hosp_dias", "blood-groups": "grupo_sanguineo_id",
};
const required = new Set<PabellonCatalogueName>(["theatres", "specialties", "surgery-types", "care-types", "patient-priorities", "admission-services", "surgical-approaches", "procedures"]);
const multi = new Set<PabellonCatalogueName>(["procedures", "preoperative-assessments", "blood-samples"]);
const catalogueLabels: Record<PabellonCatalogueName, string> = {
  theatres: "pabellón", specialties: "especialidad", "surgery-types": "tipo de cirugía",
  "care-types": "tipo de atención", "patient-priorities": "prioridad del paciente",
  "priority-types": "prioridad de la solicitud", "admission-services": "servicio de ingreso",
  "surgical-approaches": "vía de abordaje", "procedures": "plan quirúrgico", asa: "clasificación ASA",
  "biopsy-types": "tipo de biopsia", "clinical-services": "servicio clínico de origen",
  "preoperative-assessments": "evaluaciones preoperatorias", "blood-samples": "muestras de sangre",
  "blood-groups": "grupo sanguíneo", "prior-hospitalization-days": "días de hospitalización previa",
  "approach-types": "tipo de vía de abordaje", "destination-services": "servicio de cama de salida", priorities: "prioridad de cama de salida",
};
type ClinicalValue = string | number | boolean | null | number[];
export type PabellonClinicalFields = Record<string, ClinicalValue>;

/** Clinical portion only. Identity, surgeon, contact/coverage and sending are separate. */
export function buildPabellonClinicalFields(draft: PabellonClinicalDraft, approachTypes: PabellonCatalogueOption[] | undefined): { fields: PabellonClinicalFields | null; errors: string[] } {
  const errors: string[] = [];
  const fields: PabellonClinicalFields = {};
  const textValid = (value: string, max: number, mandatory = false) =>
    [...value].length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) && (!mandatory || Boolean(value.trim()));
  for (const group of pabellonCatalogueNames) {
    if (group === "priorities" || group === "priority-types" || group === "clinical-services") continue;
    const items = draft.selections[group];
    if (required.has(group) && !items.length) errors.push("Falta seleccionar " + catalogueLabels[group] + ".");
    if (!multi.has(group) && items.length > 1) errors.push("Selección múltiple no permitida: " + catalogueLabels[group] + ".");
    if (new Set(items.map((item) => item.sourceId)).size !== items.length) errors.push("Selección repetida: " + catalogueLabels[group] + ".");
    const ids = items.map((item) => {
      const id = Number(item.sourceId);
      if (!/^[1-9][0-9]*$/.test(item.sourceId) || !Number.isSafeInteger(id) || id > 2147483647 ||
          !item.active || item.system !== "urn:hcsba:pabellon:catalogue:" + group) errors.push("Referencia no válida: " + catalogueLabels[group] + ".");
      return id;
    });
    if (idFields[group] && ids.length) fields[idFields[group]!] = ids[0]!;
    if (group === "procedures") fields.plan_quirurgico = ids;
    if (group === "preoperative-assessments") fields.evaluacion_preoperatoria = ids;
    if (group === "blood-samples") fields.muestra_sangre_id = ids;
  }
  if (!textValid(draft.diagnosis, 2000, true)) errors.push("Ingrese un diagnóstico de hasta 2000 caracteres.");
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(draft.duration) || draft.duration === "00:00") errors.push("Ingrese una duración válida HH:mm mayor que cero y menor a 24 horas.");
  for (const [name, value] of Object.entries({ "paciente hospitalizado": draft.hospitalized, "paciente oncológico": draft.oncology, "alergia al látex": draft.latexAllergy, "reintervención": draft.reintervention, "lateralidad": draft.lateral, "biopsia": draft.biopsy, "producto sanguíneo": draft.bloodProducts, "cama de salida": draft.destinationBed })) {
    if (typeof value !== "boolean") errors.push("Responda Sí o No: " + name + ".");
  }
  const prior = draft.hospitalized === false && draft.priorHospitalization === true;
  if (draft.hospitalized === false && typeof draft.priorHospitalization !== "boolean") errors.push("Indique si requiere hospitalización previa.");
  if (prior && (!draft.selections["prior-hospitalization-days"].length || !textValid(draft.priorReason, 5000, true))) errors.push("Complete días y motivo de hospitalización previa.");
  if (draft.lateral === true && !["izquierda", "derecha", "bilateral"].includes(draft.side)) errors.push("Seleccione la lateralidad.");
  const approach = draft.selections["approach-types"][0];
  const parentId = draft.selections["surgical-approaches"][0]?.sourceId;
  const children = approachTypes?.filter((item) => item.relations.some((parent) => parent.system === "urn:hcsba:pabellon:catalogue:surgical-approaches" && parent.sourceId === parentId));
  if (parentId && !approachTypes) errors.push("Espere la verificación de los tipos de vía de abordaje.");
  if (children?.length && !approach) errors.push("Seleccione el tipo de vía de abordaje.");
  if (approach && (!children?.some((child) => child.sourceId === approach.sourceId))) errors.push("Seleccione un tipo de vía de abordaje vigente.");
  if (approach && !approach.relations.some((parent) => parent.system === "urn:hcsba:pabellon:catalogue:surgical-approaches" && parent.sourceId === draft.selections["surgical-approaches"][0]?.sourceId)) errors.push("El tipo de abordaje no pertenece a la vía seleccionada.");
  if (draft.biopsy === true && !draft.selections["biopsy-types"].length) errors.push("Seleccione el tipo de biopsia.");
  const destination = draft.destinationBed === true;
  if (destination && !draft.selections["destination-services"].length) errors.push("Seleccione la cama de salida.");
  const blood = draft.bloodProducts === true;
  if (blood && (!draft.selections["blood-samples"].length || !draft.selections["blood-groups"].length || typeof draft.donor !== "boolean" || typeof draft.rh !== "boolean" || !textValid(draft.bloodDescription, 5000, true))) errors.push("Complete producto sanguíneo, grupo, Rh, donantes y descripción.");
  const other = draft.selections["preoperative-assessments"].some((item) => item.display.trim().toLocaleUpperCase("es") === "OTROS");
  if (other && !textValid(draft.otherAssessments, 2000, true)) errors.push("Complete la evaluación preoperatoria OTROS.");
  for (const value of [draft.additionalPlan, draft.priorReason, draft.otherAssessments, draft.destinationConditions, draft.bloodDescription, draft.medicalEquipment, draft.optionalSupplies]) if (!textValid(value, 5000)) errors.push("Los textos adicionales admiten hasta 5000 caracteres.");
  Object.assign(fields, {
    diagnostico: draft.diagnosis.trim(), duracion: draft.duration,
    checklist_enfermeria: true,
    dispositivos_solicitados: draft.medicalEquipment.trim(), insumos_opcionales: draft.optionalSupplies.trim(),
    paciente_hospitalizado: draft.hospitalized === true, hospitalizacion_previa: prior,
    paciente_oncologico: draft.oncology === true, alergico: draft.latexAllergy === true,
    re_intervencion: draft.reintervention === true, lateralidad: draft.lateral === true,
    tipo_lateralidad: draft.lateral === true ? draft.side : null,
    tipo_biopsia_id: draft.biopsy === true ? fields.tipo_biopsia_id : null,
    id_prev_hosp_dias: prior ? fields.id_prev_hosp_dias : null,
    motivo_hospitalizacion_previa: prior ? draft.priorReason.trim() : "",
    plan_quirurgico_esp: draft.additionalPlan.trim(),
    evaluacion_preoperatoria_otros: other ? draft.otherAssessments.trim() : null,
    servicio_cama_salida_id: destination ? fields.servicio_cama_salida_id : null,
    prioridad_id: null,
    condiciones_prioridad: destination ? draft.destinationConditions.trim() : "",
    grupo_sanguineo_id: blood ? fields.grupo_sanguineo_id : 0,
    muestra_sangre_id: blood ? fields.muestra_sangre_id : [],
    descripcion_muestra_sangre: blood ? draft.bloodDescription.trim() : "",
    donante: blood && draft.donor === true, rh: blood && draft.rh === true,
  });
  if (new TextEncoder().encode(JSON.stringify(fields)).length > 8192) errors.push("El contenido clínico combinado supera el límite de envío de 8 KB. Reduzca los textos antes de continuar.");
  return { fields: errors.length ? null : fields, errors };
}
