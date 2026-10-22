import { z } from "zod";
import { gatewayPath, MpiAdmissionError } from "./admission";

const chart = z.object({ uuid: z.string(), birthDate: z.unknown().optional(), gender: z.string().nullable().optional(),
  names: z.array(z.object({ given_name: z.string().nullable(), middle_name: z.string().nullable().optional(), family_name: z.string().nullable(), family_name2: z.string().nullable().optional() }).loose()),
  identifiers: z.array(z.object({ uuid: z.string(), identifier: z.string(), type: z.string(), voided: z.union([z.boolean(),z.number()]) }).loose()) }).loose();
const preview = z.object({ preferred: chart, secondary: chart, fingerprint: z.string(), blockers: z.array(z.string()),
  counts: z.record(z.string(),z.object({ preferred: z.number(), secondary: z.number() })) }).loose();
const separation = z.object({ preferred: chart, secondary: chart, fingerprint: z.string(), blockers: z.array(z.string()),
  newRecords: z.array(z.object({ key: z.string(), category: z.string(), description: z.string().optional(), uuid: z.string().nullish(), createdAt: z.unknown().optional() }).loose()) }).loose();
const clinical = z.object({ preferredUuid: z.string(), secondaryUuid: z.string(), operationId: z.string(), preview,
  separation: separation.optional(), clinicalCommitted: z.boolean().optional() }).loose();
const schema = z.object({ id: z.string(), version: z.number().optional(), status: z.string(), clinical });
export type ClinicalCase = z.infer<typeof schema>;
export type ClinicalChart = z.infer<typeof chart>;
const errors: Record<string,string> = {
  MPI_EXTERNAL_SOURCES_REVIEW_REQUIRED: "La identidad incluye otros registros de origen. Primero debe adjudicarse su pertenencia en OpenCR; no se separarán automáticamente.",
  MPI_SHARED_DOCUMENT_REQUIRES_REVIEW: "Ambas fichas conservan un documento coincidente. Revise su titularidad antes de declarar que son personas distintas.",
  CLINICAL_PREVIEW_CHANGED: "Los antecedentes cambiaron. Actualice la vista previa y vuelva a revisarlos.",
  CLINICAL_RELATIONSHIP_CONFLICT: "La asignación separaría antecedentes de una misma atención. Revise que la atención, sus órdenes y observaciones queden en la misma ficha.",
  POST_CONSOLIDATION_ASSIGNMENT_REQUIRED: "Decida a qué ficha corresponde cada antecedente incorporado después de la consolidación.",
  CLINICAL_RECORD_CHANGED: "Un antecedente cambió de pertenencia. Solicite revisión especializada antes de separar.",
  CLINICAL_PAIR_REQUIRES_REVIEW: "Este caso requiere revisar la identidad y seleccionar exactamente dos fichas antes de consolidar.",
  CLINICAL_SOURCE_REQUIRED: "Primero debe verificarse la identidad local de ambas fichas.",
  CLINICAL_SOURCE_CHANGED: "La asociación de identidad cambió. Solicite revisión antes de continuar.",
  CONSOLIDATION_BLOCKED: "Hay condiciones clínicas que deben resolverse antes de consolidar. Actualice la vista previa.",
  SEPARATION_BLOCKED: "Hay condiciones clínicas que deben resolverse antes de separar. Actualice la vista previa.",
  REVIEW_REFRESH_REQUIRED: "La revisión cambió. Actualice la vista previa.",
  CLINICAL_CHART_BUSY: "Una de las fichas participa en otra consolidación pendiente.",
};
async function request(id: string, action: string, body: unknown) {
  const response = await fetch(gatewayPath(`/_reviews/${encodeURIComponent(id)}/${action}`), { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new MpiAdmissionError(errors[data.issue?.[0]?.diagnostics || ""] ||
    (response.status === 403 ? "Esta acción requiere el permiso de consolidar o separar fichas." : "No se completó la operación. Actualice la bandeja y revise su estado antes de recuperar la misma operación."),response.status);
  return schema.parse(data);
}
export const prepareClinicalCase = (id: string, preferredUuid?: string) => request(id,"clinical-prepare",{preferredUuid});
export const prepareSeparationCase = (id: string) => request(id,"separation-prepare",{});
export const consolidateCase = (row: ClinicalCase, reason: string) => request(row.id,"consolidate",{version:row.version,fingerprint:row.clinical.preview.fingerprint,reason});
export const separateCase = (row: ClinicalCase, reason: string, assignments: Record<string,string>, splitIdentity: boolean) => request(row.id,"separate",{
  version:row.version,fingerprint:row.clinical.separation?.fingerprint,reason,assignments,splitIdentity,
});
export const clinicalCategoryLabels: Record<string,string> = {
  visit:"Visitas",encounter:"Atenciones clínicas",obs:"Observaciones y resultados",orders:"Órdenes",order_group:"Grupos de órdenes",
  allergy:"Alergias",conditions:"Condiciones clínicas",medication_administration:"Administraciones de medicamentos",medication_dispense:"Dispensaciones",
  encounter_diagnosis:"Diagnósticos de atención",patient_identifier:"Documentos y números de ficha",patient_program:"Programas de atención",
  person_name:"Nombres registrados",person_address:"Direcciones",person_attribute:"Datos complementarios",relationship:"Relaciones personales",
  patient_appointment:"Citas",surgical_appointment:"Citas quirúrgicas",bed_patient_assignment_map:"Historial de camas",care_team:"Equipos de atención",
  cohort_member:"Grupos de seguimiento",fhir_diagnostic_report:"Informes de resultados",note:"Notas clínicas",
};
export const chartName = (c: ClinicalChart) => {const n=c.names[0];return n?[n.given_name,n.middle_name,n.family_name,n.family_name2].filter(Boolean).join(" "):"Paciente";};
