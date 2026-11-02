import { z } from "zod";
import { bahmniRequest, BahmniApiError } from "./http";

const text = z.string().max(12000);
const sourceDate = z.object({ rawValue: text, sourceTimezone: text.nullable(), normalizedInstant: text.nullable(), interpretation: text });
const code = z.object({ sourceId: text, system: text, code: text, display: text.nullable() });
const schedule = z.object({ sourceId: text, active: z.boolean().nullable(), theatre: code.nullable(), room: code.nullable(), start: sourceDate.nullable(), end: sourceDate.nullable() });
const event = z.object({ sourceId: text, active: z.boolean(), type: code.nullable(), option: code.nullable(), occurredAt: sourceDate.nullable() });
const request = z.object({
  contentSource: z.literal("request-snapshot"), requestNumber: text.nullable(), origin: z.enum(["normal", "regularization", "urgency", "unknown"]),
  urgencyRequestComplete: z.boolean().nullable(), patientAtRegistration: z.object({ givenNames: text.nullable(), familyName: text.nullable(), secondFamilyName: text.nullable() }).nullable(),
  specialty: code.nullable(), plannedProcedures: z.array(code).nullable(), diagnosis: text.nullable(), duration: text.nullable(),
  hospitalization: z.object({ value: z.boolean().nullable(), provenance: z.enum(["snapshot-value", "legacy-default"]) }),
  admissionService: code.nullable(), stateAtSnapshot: code.nullable(), schedulesAtSnapshot: z.array(schedule).nullable(),
  operationalAtSnapshot: z.object({ updatedAt: sourceDate.nullable(), revision: z.string().regex(/^[a-f0-9]{64}$/), urgencyCompletenessKnown: z.boolean(), captureVersion: z.literal(1), changeCode: text, events: z.array(event) }).nullable().optional(),
});
export const pabellonItemSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/),
  source: z.object({ system: text, environment: text, endpointEnvironment: text, id: text, observedAt: text, revision: text.nullable() }),
  requestSnapshot: z.object({ status: z.enum(["available", "unavailable", "ambiguous", "invalid"]), snapshotId: text.nullable(), version: z.number().int().positive().nullable(), capturedAt: sourceDate.nullable() }),
  request: request.nullable(), warningCodes: z.array(text),
}).superRefine((item, ctx) => {
  if (item.source.id !== item.id || (item.requestSnapshot.status === "available") !== (item.request !== null)) ctx.addIssue({ code: "custom", message: "Snapshot context mismatch" });
  const meta = item.requestSnapshot;
  if (meta.status === "available" ? meta.snapshotId === null || meta.version === null || item.source.revision === null : meta.snapshotId !== null || meta.version !== null || meta.capturedAt !== null || item.source.revision !== null) ctx.addIssue({ code: "custom", message: "Snapshot metadata mismatch" });
  if (item.request && (item.request.hospitalization.value === null || item.request.hospitalization.provenance === "legacy-default" && item.request.hospitalization.value !== false)) ctx.addIssue({ code: "custom", message: "Historical hospitalization mismatch" });
});
const pageSchema = z.object({ schemaVersion: z.literal("2"), patient: z.object({ uuid: z.uuid(), hisEnvironment: text, identityStatus: z.literal("matched"), linkVersion: z.number().int().positive() }), items: z.array(pabellonItemSchema).max(100), nextCursor: z.string().min(1).max(2048).nullable(), observedAt: text, correlationId: z.uuid() });
export type PabellonItem = z.infer<typeof pabellonItemSchema>;
export type PabellonPage = z.infer<typeof pageSchema>;
export const QA_PABELLON_SOURCE = { system: "pabellon-hcsba-qa", environment: "qa-isolated", endpoint: "qa-isolated227", his: "bahmni225-dev" } as const;

const messages: Record<string, string> = {
  SESSION_REQUIRED: "La sesión no está habilitada para esta integración.", SURGERY_READ_FORBIDDEN: "No tiene permisos institucionales para consultar Pabellón.",
  IDENTITY_UNRESOLVED: "La identidad del paciente requiere conciliación.", IDENTITY_AMBIGUOUS: "Hay correspondencias ambiguas. Se requiere revisión.",
  IDENTITY_CONFLICT: "Los identificadores del paciente cambiaron. Se requiere revisión.", PATIENT_CONTEXT_MISMATCH: "El contexto del paciente no está habilitado o cambió. No se muestran datos.",
  AUDIT_UNAVAILABLE: "La auditoría no está disponible. La consulta fue bloqueada.", SOURCE_TIMEOUT: "La consulta excedió el tiempo disponible.", SOURCE_UNAVAILABLE: "Pabellón no está disponible en este momento.",
  SOURCE_CONTRACT_MISMATCH: "La respuesta de Pabellón no cumple el contrato esperado.", INVALID_CURSOR: "La página venció o cambió el contexto. Actualice la consulta.", INVALID_FILTER: "Los filtros de consulta no son válidos.",
};
export class PabellonReadError extends Error {
  constructor(public readonly code: string) { super(messages[code] ?? messages.SOURCE_UNAVAILABLE); this.name = "PabellonReadError"; }
}
export function validatePabellonPage(raw: unknown, patientUuid: string): PabellonPage {
  const parsed = pageSchema.safeParse(raw);
  if (!parsed.success) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  const page = parsed.data;
  if (page.patient.uuid !== patientUuid || page.patient.hisEnvironment !== QA_PABELLON_SOURCE.his || page.items.some((item) => item.source.system !== QA_PABELLON_SOURCE.system || item.source.environment !== QA_PABELLON_SOURCE.environment || item.source.endpointEnvironment !== QA_PABELLON_SOURCE.endpoint)) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  if (new Set(page.items.map((item) => item.id)).size !== page.items.length) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  if (page.nextCursor && !page.items.length || page.items.some((item, index) => item.source.observedAt !== page.observedAt || index > 0 && BigInt(item.id) >= BigInt(page.items[index - 1]!.id))) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  return page;
}
export function mergePabellonPages(pages: PabellonPage[]): PabellonItem[] {
  const items = pages.flatMap((page) => page.items);
  const first = pages[0];
  if (first && pages.some((page) => page.patient.uuid !== first.patient.uuid || page.patient.linkVersion !== first.patient.linkVersion || page.patient.hisEnvironment !== first.patient.hisEnvironment) || new Set(items.map((item) => item.id)).size !== items.length) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  return items;
}
export async function getPabellonHistory(patientUuid: string, cursor: string | undefined, signal?: AbortSignal): Promise<PabellonPage> {
  if (!z.uuid().safeParse(patientUuid).success || cursor !== undefined && (!cursor || cursor.length > 2048)) throw new PabellonReadError("INVALID_FILTER");
  const query = new URLSearchParams({ limit: "20" }); if (cursor) query.set("cursor", cursor);
  try {
    const raw = await bahmniRequest<unknown>("/pabellon-gateway/v1/patients/" + encodeURIComponent(patientUuid) + "/surgeries?" + query.toString(), { signal, cache: "no-store", skipUnauthorizedEvent: true });
    return validatePabellonPage(raw, patientUuid);
  } catch (error) {
    if (error instanceof PabellonReadError || signal?.aborted) throw error;
    if (error instanceof BahmniApiError) {
      const value = error.payload && typeof error.payload === "object" ? (error.payload as Record<string, unknown>).code : undefined;
      const safe = typeof value === "string" && Object.hasOwn(messages, value) ? value : error.status === 401 ? "SESSION_REQUIRED" : error.status === 403 ? "SURGERY_READ_FORBIDDEN" : "SOURCE_UNAVAILABLE";
      throw new PabellonReadError(safe);
    }
    throw new PabellonReadError("SOURCE_UNAVAILABLE");
  }
}
