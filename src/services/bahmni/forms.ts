import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import { flattenFormTranslations } from "@/config-compat/formTranslations";
import { loadFormTranslationOverrides } from "./config";

const providerSchema = z.object({ providerName: z.string().optional(), uuid: z.string().optional() }).loose();
const bahmniDateTimeSchema = z.union([z.string(), z.number()]);
export const patientFormSummarySchema = z.object({
  formName: z.string(),
  encounterDateTime: bahmniDateTimeSchema,
  encounterUuid: z.string(),
  visitUuid: z.string().optional(),
  visitStartDateTime: bahmniDateTimeSchema.optional(),
  formVersion: z.union([z.string(), z.number()]).optional(),
  providers: z.array(providerSchema).default([]),
}).loose();
export type PatientFormSummary = z.infer<typeof patientFormSummarySchema>;

export const publishedFormSchema = z.object({
  formName: z.string().optional(),
  name: z.string().optional(),
  formUuid: z.string().optional(),
  uuid: z.string().optional(),
  formVersion: z.union([z.string(), z.number()]).optional(),
  version: z.union([z.string(), z.number()]).optional(),
  nameTranslation: z.string().optional(),
  privileges: z.array(z.object({ privilegeName: z.string(), viewable: z.boolean().optional(), editable: z.boolean().optional() }).loose()).optional(),
}).loose();
export type PublishedForm = z.infer<typeof publishedFormSchema>;

const looseRecord = z.record(z.string(), z.unknown());
const formResourceSchema = z.object({ resources: z.array(z.object({ value: z.string() }).loose()).default([]) }).loose();
const registrationEncounterSchema = z.object({ encounterUuid: z.string().nullish(), observations: z.array(looseRecord).default([]) }).loose();
const complexUploadSchema = z.object({
  url: z.string().optional(),
  error: z.object({ message: z.string().optional() }).loose().optional(),
}).loose();

export async function getPatientFormSummaries(patientUuid: string, numberOfVisits?: number | string): Promise<PatientFormSummary[]> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/patient/${encodeURIComponent(patientUuid)}/forms${queryString({ formType: "v2", numberOfVisits })}`, { schema: z.array(patientFormSummarySchema) });
}

export async function getLatestPublishedForms(encounterUuid?: string): Promise<PublishedForm[]> {
  return bahmniRequest(`/ws/rest/v1/bahmniie/form/latestPublishedForms${queryString({ encounterUuid })}`, { schema: z.array(publishedFormSchema) });
}

export async function getBahmniEncounter(encounterUuid: string): Promise<Record<string, unknown>> {
  return bahmniRequest(`/ws/rest/v1/bahmnicore/bahmniencounter/${encodeURIComponent(encounterUuid)}${queryString({ includeAll: false })}`, { schema: looseRecord });
}

export function buildFormEncounterUpdate(encounter: Record<string, unknown>, formName: string, formObservations: Array<Record<string, unknown>>) {
  const current = Array.isArray(encounter.observations)
    ? encounter.observations.filter((observation): observation is Record<string, unknown> => Boolean(observation && typeof observation === "object" && !Array.isArray(observation)))
    : [];
  const unrelated = current.filter((observation) => !String(observation.formFieldPath ?? "").startsWith(`${formName}.`));
  return {
    patientUuid: encounter.patientUuid,
    encounterUuid: encounter.encounterUuid,
    visitUuid: encounter.visitUuid,
    visitTypeUuid: encounter.visitTypeUuid,
    visitType: encounter.visitType,
    locationUuid: encounter.locationUuid,
    providers: encounter.providers ?? [],
    encounterDateTime: encounter.encounterDateTime,
    extensions: encounter.extensions ?? {},
    context: encounter.context ?? {},
    disposition: encounter.disposition,
    bahmniDiagnoses: [],
    orders: [],
    drugOrders: [],
    observations: [...unrelated, ...formObservations],
  };
}

export async function updateFormEncounter(encounter: Record<string, unknown>, formName: string, formObservations: Array<Record<string, unknown>>) {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", {
    method: "POST",
    body: JSON.stringify(buildFormEncounterUpdate(encounter, formName, formObservations)),
    schema: looseRecord,
  });
}

export async function getFormDefinition(formUuid: string): Promise<unknown> {
  const response = await bahmniRequest(`/ws/rest/v1/form/${encodeURIComponent(formUuid)}${queryString({ v: "custom:(resources:(value))" })}`, { schema: formResourceSchema });
  const definition = response.resources[0]?.value;
  if (!definition) throw new Error("El formulario publicado no contiene una definición utilizable.");
  return JSON.parse(definition) as unknown;
}

export async function getFormTranslations(params: { formName: string; formVersion: string; locale: string; formUuid: string }): Promise<Record<string, string>> {
  const overridesPromise = loadFormTranslationOverrides(params.formUuid, params.locale);
  try {
    const response = await bahmniRequest<unknown>(`/ws/rest/v1/bahmniie/form/translations${queryString(params)}`);
    const overrides = await overridesPromise;
    // El bundle solicitado tiene precedencia: Bahmni devuelve el locale por defecto
    // (normalmente `en`) cuando el locale pedido no fue publicado.
    return { ...flattenFormTranslations(response, params.locale), ...overrides };
  } catch (error) {
    const overrides = await overridesPromise;
    if (Object.keys(overrides).length) return overrides;
    throw error;
  }
}

/**
 * Same contract used by the legacy ImageUrlHandler/VideoUrlHandler controls.
 * The file is uploaded immediately and the returned URL is persisted as the
 * value of the Complex observation when the encounter is saved.
 */
export async function uploadForm2ComplexFile(params: {
  dataUrl: string;
  patientUuid: string;
  fileType: "image" | "video" | "pdf";
  fileName?: string;
  encounterTypeName?: string;
}): Promise<string> {
  const marker = ";base64,";
  const markerIndex = params.dataUrl.indexOf(marker);
  if (markerIndex < 0) throw new Error("El archivo no pudo convertirse a base64.");
  const mime = params.dataUrl.slice(5, markerIndex);
  const format = mime.split("/")[1]?.split(";")[0] ?? params.fileType;
  const response = await bahmniRequest("/ws/rest/v1/bahmnicore/visitDocument/uploadDocument", {
    method: "POST",
    body: JSON.stringify({
      content: params.dataUrl.slice(markerIndex + marker.length),
      format,
      patientUuid: params.patientUuid,
      encounterTypeName: params.encounterTypeName,
      fileType: params.fileType,
      fileName: params.fileName?.replace(/\.[^.]+$/, ""),
    }),
    schema: complexUploadSchema,
  });
  if (response.error || !response.url) throw new Error(response.error?.message ?? "No fue posible cargar el archivo.");
  return response.url;
}

export async function findRegistrationEncounter(params: { patientUuid: string; locationUuid: string; providerUuid?: string; encounterTypeUuid: string }) {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter/find", {
    method: "POST",
    body: JSON.stringify({ patientUuid: params.patientUuid, providerUuids: params.providerUuid ? [params.providerUuid] : null, includeAll: false, locationUuid: params.locationUuid, encounterTypeUuids: [params.encounterTypeUuid] }),
    schema: registrationEncounterSchema,
  });
}
