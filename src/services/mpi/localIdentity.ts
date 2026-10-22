import { z } from "zod";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";
import { gatewayPath, MpiAdmissionError } from "./admission";

const mapEntry = z.object({ name: z.string(), teiTypeCode: z.string(), issuerCountryCode: z.string().optional() });
const capabilitiesSchema = z.object({ enabled: z.boolean(), deferredReviews: z.boolean().optional(), canManage: z.boolean().optional(), identifierMap: z.array(mapEntry).default([]) });
const identityIdentifierSchema = z.object({ system: z.string().optional(), value: z.string().optional(),
  type: z.object({ coding: z.array(z.object({ code: z.string().optional() }).loose()).optional(),
    extension: z.array(z.object({ url: z.string().optional(), valueCodeableConcept: z.object({ coding: z.array(z.object({ code: z.string().optional() }).loose()).optional() }).loose().optional() }).loose()).optional(),
  }).loose().optional() }).loose();
const identityPatientSchema = z.object({
  identifier: z.array(identityIdentifierSchema).optional(),
  name: z.array(z.object({ use: z.string().optional(), given: z.array(z.string()).optional(), family: z.string().optional(),
    _family: z.object({ extension: z.array(z.object({ url: z.string().optional(), valueString: z.string().optional() }).loose()).optional() }).loose().optional(),
  }).loose()).optional(), birthDate: z.string().optional(), gender: z.string().optional(),
}).loose();
const candidateSchema = z.object({ crid: z.string(), category: z.enum(["auto", "potential", "conflict"]),
  localPatientUuid: z.string().optional(), clinicalNumber: z.string().optional(), clinicalConflict: z.boolean().optional(), score: z.number().optional(),
  patient: identityPatientSchema }).loose();
const matchSchema = z.object({ token: z.string(), candidates: z.array(candidateSchema), alreadyReviewed: z.boolean().optional(), provider: z.literal("opencr") }).loose();
export type IdentityCapabilities = z.infer<typeof capabilitiesSchema>;
export type IdentityMatch = z.infer<typeof matchSchema>;
export type IdentityPatient = z.infer<typeof identityPatientSchema>;
export interface IdentityReview { token?: string; patientUuid?: string; selectedCrid?: string; reason?: string; caseId?: string; heldRun?: string }

export async function getIdentityCapabilities(): Promise<IdentityCapabilities> {
  const response = await fetch(gatewayPath("/_identity"), { credentials: "include" });
  if (response.status === 404) return { enabled: false, identifierMap: [] };
  if (!response.ok) throw new MpiAdmissionError("No se pudo comprobar la configuración MPI.", response.status);
  return capabilitiesSchema.parse(await response.json());
}

export function identityFromForm(values: PatientFormValues, types: IdentifierType[], mapping: IdentityCapabilities["identifierMap"]) {
  const documents = [...(values.additionalIdentifiers || []),
    ...(values.identifier && values.identifierTypeUuid ? [{ identifier: values.identifier, identifierTypeUuid: values.identifierTypeUuid, metadata: values.primaryIdentifierMetadata }] : [])];
  const identifier = documents.filter(i => !i.voided && i.identifier).flatMap(i => {
    const name = types.find(t => t.uuid === i.identifierTypeUuid)?.name;
    const mapped = mapping.find(m => m.name === name);
    if (!mapped) return [];
    const country = i.metadata?.issuerCountryCode || mapped.issuerCountryCode;
    return [{ value: i.identifier, type: { coding: [{ code: mapped.teiTypeCode }],
      ...(country ? { extension: [{ url: "https://hl7chile.cl/fhir/ig/clcore/StructureDefinition/CodigoPaises",
        valueCodeableConcept: { coding: [{ code: country }] } }] } : {}) } }];
  });
  return { resourceType: "Patient", identifier,
    name: [{ use: "official", given: [[values.givenName, values.middleName].filter(Boolean).join(" ")], family: values.familyName,
      ...(values.familyName2 ? { _family: { extension: [{ url: "https://hl7chile.cl/fhir/ig/clcore/StructureDefinition/SegundoApellido", valueString: values.familyName2 }] } } : {}) }],
    gender: ({ M: "male", F: "female", O: "other", U: "unknown" } as Record<string, string>)[values.gender], birthDate: values.birthDate };
}

export async function matchLocalIdentity(patient: ReturnType<typeof identityFromForm>, patientUuid?: string): Promise<IdentityMatch> {
  const response = await fetch(gatewayPath("/_match"), { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient, patientUuid }) });
  if (!response.ok) throw new MpiAdmissionError("No se pudo verificar la identidad. Revise los documentos y su país emisor; si el problema continúa, solicite ayuda a soporte antes de guardar.", response.status);
  return matchSchema.parse(await response.json());
}

const caseSchema = z.object({ id: z.string(), status: z.string(), patientUuid: z.string().optional(), clinicalNumber: z.string().optional(),
  patient: identityPatientSchema, heldRun: z.string().optional(), reason: z.string(), requestedBy: z.string(), createdAt: z.string(),
  version: z.number(), candidates: z.array(candidateSchema).optional(), token: z.string().optional(),
  resolution: z.object({ decision: z.string(), actor: z.string(), reason: z.string(), at: z.string() }).loose().optional(),
  history: z.array(z.object({ event: z.string(), actor: z.string().optional(), reason: z.string().optional(), at: z.string().optional() }).loose()).optional(),
  clinical: z.object({ operationId: z.string(), preferredUuid: z.string(), secondaryUuid: z.string(),
    completedAt: z.string().optional(), separatedAt: z.string().optional(), clinicalCommitted: z.boolean().optional(),
    preview: z.object({ preferred: z.object({ identifiers: z.array(z.object({ identifier: z.string(), preferred: z.boolean().optional() }).loose()).optional() }).loose().optional(),
      secondary: z.object({ identifiers: z.array(z.object({ identifier: z.string(), preferred: z.boolean().optional() }).loose()).optional() }).loose().optional() }).loose().optional(),
  }).loose().optional(),
}).loose();
export type IdentityCase = z.infer<typeof caseSchema>;
const reviewErrors: Record<string, string> = {
  IDENTITY_MANAGER_REQUIRED: "Esta acción requiere el perfil gestor de identidad.",
  REVIEW_CHART_CHANGED: "Los datos de la ficha cambiaron. Solicite una nueva revisión antes de decidir.",
  REVIEW_CANDIDATES_CHANGED: "La información encontrada cambió. Actualice la revisión y vuelva a comparar.",
  REVIEW_REFRESH_REQUIRED: "La revisión cambió o venció. Actualice los antecedentes antes de resolver.",
  REVIEW_ALREADY_DECIDED: "Otro gestor ya resolvió este caso. Actualice la bandeja.",
  REVIEW_NOT_READY: "Primero debe completarse el guardado de la ficha.",
  REVIEW_RECOVER_SAME_DECISION: "La resolución quedó en curso. Recupere la misma decisión para completar y verificar la asociación.",
  REVIEW_LINK_UNVERIFIED: "Falta verificar la asociación. Actualice la revisión para recuperar la resolución.",
  REVIEW_BUSY: "Otro proceso está trabajando en esta revisión. Actualice la bandeja.",
  REVIEW_OPEN_EXISTING_CHART: "El documento ya pertenece a una ficha. Abra la ficha existente antes de continuar.",
  IDENTITY_OTHER_CLINICAL_RECORD: "El RUN pertenece a otra ficha. Se requiere revisar la unificación de fichas.",
  IDENTITY_EXACT_MATCH_REQUIRES_RESOLUTION: "El documento coincide con otra identidad. Revise la propuesta o déjela pendiente.",
};
async function reviewRequest(path: string, body?: unknown) {
  const response = await fetch(gatewayPath(path), { credentials: "include", ...(body !== undefined ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MpiAdmissionError(reviewErrors[data.issue?.[0]?.diagnostics || ""] || (response.status === 403 ? "Esta acción requiere el perfil gestor de identidad." : "No fue posible completar la revisión. Actualice e inténtelo nuevamente."), response.status);
  return data;
}
export async function requestIdentityReview(patient: IdentityPatient, patientUuid: string | undefined, token: string, reason: string) {
  return z.object({ id: z.string(), heldRun: z.string().optional(), patientUuid: z.string().optional() }).parse(await reviewRequest("/_reviews", { patient, patientUuid, token, reason }));
}
export async function listIdentityReviews(patientUuid?: string, offset = 0): Promise<IdentityCase[]> {
  const params = new URLSearchParams();
  if (patientUuid) params.set("patientUuid", patientUuid);
  if (offset) params.set("offset", String(offset));
  return z.object({ cases: z.array(caseSchema) }).parse(await reviewRequest(`/_reviews${params.size ? `?${params}` : ""}`)).cases;
}
export async function prepareIdentityResolution(id: string): Promise<IdentityCase> { return caseSchema.parse(await reviewRequest(`/_reviews/${encodeURIComponent(id)}/prepare`, {})); }
export async function getIdentityCase(id: string): Promise<IdentityCase> { return caseSchema.parse(await reviewRequest(`/_reviews/${encodeURIComponent(id)}`)); }
export async function resolveIdentityCase(id: string, body: { version: number; decision: "same" | "different" | "defer"; selectedCrid?: string; reason: string }): Promise<{ status: string }> {
  return z.object({ status: z.string() }).parse(await reviewRequest(`/_reviews/${encodeURIComponent(id)}/resolve`, body));
}
export function valuesForPendingReview(values: PatientFormValues, types: IdentifierType[], review?: IdentityReview | null): PatientFormValues {
  if (!review?.heldRun) return values;
  const isRun = (uuid?: string) => types.some(t => t.uuid === uuid && (t.name ?? t.display) === "RUN");
  if (isRun(values.identifierTypeUuid)) throw new Error("La ficha debe tener su número de atención antes de enviar el RUN a revisión.");
  return { ...values, additionalIdentifiers: (values.additionalIdentifiers || []).filter(i => !isRun(i.identifierTypeUuid)) };
}
