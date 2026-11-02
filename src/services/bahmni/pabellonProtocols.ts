import { z } from "zod";
import { bahmniRequest, BahmniApiError } from "./http";
import { QA_PABELLON_SOURCE } from "./pabellon";

const text = z.string().min(1).max(5000).refine((value) => value.trim() === value && value.toUpperCase() !== "NULL");
const id = z.string().regex(/^[1-9][0-9]*$/).max(19).refine((value) => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n);
const date = z.object({ rawValue: z.string().min(1).max(64), sourceTimezone: z.null(), normalizedInstant: z.null(), interpretation: z.literal("unresolved") }).strict();
const code = z.object({ sourceId: id, system: text, code: text, display: text.nullable() }).strict();
const names = z.object({ givenNames: text.nullable(), familyName: text.nullable(), secondFamilyName: text.nullable() }).strict();
const version = z.object({
  snapshotId: id, protocolId: id, version: z.number().int().min(1).max(2147483647), amendment: z.boolean(), contentSource: z.literal("protocol-snapshot"),
  closedAt: date, capturedAt: date.nullable(), digitalSignature: z.literal("not-established"), sourceDataSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  clinical: z.object({ patientAtRegistration: names.nullable(), diagnosis: text.nullable(), surgicalDetail: text.nullable(), observations: text.nullable(), surgeon: text.nullable(), laterality: text.nullable(), additionalProcedure: text.nullable(), procedures: z.array(code).max(100), team: z.array(z.object({ name: text.nullable(), role: code.nullable() }).strict()).max(100) }).strict(),
}).strict();
const family = z.object({ family: z.enum(["surgeon", "responsible"]), status: z.enum(["available", "no-published-versions", "ambiguous", "invalid"]), latestPublishedVersion: z.number().int().positive().nullable(), withheldVersions: z.number().int().min(0).max(200), versions: z.array(version).max(200), warningCodes: z.array(z.string().min(1).max(80)).max(200) }).strict();
const history = z.object({ schemaVersion: z.literal("1"), patient: z.object({ uuid: z.uuid(), hisEnvironment: text, identityStatus: z.literal("matched"), linkVersion: z.number().int().positive() }).strict(), surgeryId: id, source: z.object({ system: text, environment: text, endpointEnvironment: text, id, observedAt: z.string().datetime({ offset: true }), revision: z.null() }).strict(), families: z.array(family).length(2), correlationId: z.uuid() }).strict();
export type PabellonProtocolHistory = z.infer<typeof history>;
export type PabellonProtocolVersion = z.infer<typeof version>;
const messages: Record<string, string> = {
  SESSION_REQUIRED: "Inicie sesión para consultar los protocolos.", PROTOCOL_READ_FORBIDDEN: "La sesión no tiene acceso a los protocolos de Pabellón.",
  RESOURCE_NOT_FOUND: "No se encontró la cirugía para este paciente.", INVALID_FILTER: "La selección de paciente o cirugía no es válida.",
  PATIENT_CONTEXT_MISMATCH: "El contexto del paciente cambió. Vuelva a abrir su ficha.", IDENTITY_UNRESOLVED: "El vínculo del paciente está pendiente de revisión.",
  IDENTITY_AMBIGUOUS: "El vínculo del paciente requiere revisión.", IDENTITY_CONFLICT: "El vínculo del paciente requiere revisión.",
  AUDIT_UNAVAILABLE: "No se pudo registrar la consulta. Inténtelo nuevamente.", SOURCE_TIMEOUT: "La consulta tardó demasiado. Inténtelo nuevamente.",
  SOURCE_CONTRACT_MISMATCH: "Los protocolos recibidos requieren revisión.", SOURCE_UNAVAILABLE: "No fue posible consultar los protocolos de Pabellón.",
};
export class PabellonProtocolError extends Error {
  constructor(public readonly code: string) { super(messages[code] ?? messages.SOURCE_UNAVAILABLE); this.name = "PabellonProtocolError"; }
}
export function validateProtocolHistory(raw: unknown, patientUuid: string, surgeryId: string): PabellonProtocolHistory {
  const parsed = history.safeParse(raw);
  const fail = () => { throw new PabellonProtocolError("SOURCE_CONTRACT_MISMATCH"); };
  if (!parsed.success) return fail();
  const value = parsed.data;
  if (value.patient.uuid !== patientUuid || value.patient.hisEnvironment !== QA_PABELLON_SOURCE.his || value.surgeryId !== surgeryId || value.source.id !== surgeryId || value.source.system !== QA_PABELLON_SOURCE.system || value.source.environment !== QA_PABELLON_SOURCE.environment || value.source.endpointEnvironment !== QA_PABELLON_SOURCE.endpoint) return fail();
  const seenSnapshots = new Set<string>(); const seenProtocols = new Set<string>(); let total = 0;
  for (const [index, entry] of value.families.entries()) {
    if (entry.family !== ["surgeon", "responsible"][index] || entry.warningCodes.some((warning, i) => i > 0 && warning <= entry.warningCodes[i - 1]!)) return fail();
    if (entry.status === "available" ? !entry.versions.length || entry.latestPublishedVersion !== entry.versions[0]!.version : entry.versions.length !== 0 || entry.latestPublishedVersion !== null) return fail();
    total += entry.withheldVersions + entry.versions.length;
    for (const [i, item] of entry.versions.entries()) {
      if (seenSnapshots.has(item.snapshotId) || seenProtocols.has(item.protocolId) || i > 0 && item.version >= entry.versions[i - 1]!.version) return fail();
      seenSnapshots.add(item.snapshotId); seenProtocols.add(item.protocolId);
      if (item.clinical.procedures.some((ref) => ref.system !== `urn:hcsba:${QA_PABELLON_SOURCE.system}:${QA_PABELLON_SOURCE.environment}:planes_quirurgicos`) || item.clinical.team.some((member) => member.role && member.role.system !== `urn:hcsba:${QA_PABELLON_SOURCE.system}:${QA_PABELLON_SOURCE.environment}:tipo_medico`)) return fail();
    }
  }
  if (total > 200) return fail();
  return value;
}
export async function getPabellonProtocols(patientUuid: string, surgeryId: string, signal?: AbortSignal): Promise<PabellonProtocolHistory> {
  if (!z.uuid().safeParse(patientUuid).success || !id.safeParse(surgeryId).success) throw new PabellonProtocolError("INVALID_FILTER");
  try {
    const raw = await bahmniRequest<unknown>(`/pabellon-gateway/v1/patients/${encodeURIComponent(patientUuid)}/surgeries/${encodeURIComponent(surgeryId)}/protocols`, { signal, cache: "no-store", skipUnauthorizedEvent: true });
    return validateProtocolHistory(raw, patientUuid, surgeryId);
  } catch (error) {
    if (error instanceof PabellonProtocolError || signal?.aborted) throw error;
    if (error instanceof BahmniApiError) {
      const candidate = error.payload && typeof error.payload === "object" ? (error.payload as Record<string, unknown>).code : undefined;
      const safe = typeof candidate === "string" && Object.hasOwn(messages, candidate) ? candidate : error.status === 401 ? "SESSION_REQUIRED" : error.status === 403 ? "PROTOCOL_READ_FORBIDDEN" : error.status === 404 ? "RESOURCE_NOT_FOUND" : "SOURCE_UNAVAILABLE";
      throw new PabellonProtocolError(safe);
    }
    throw new PabellonProtocolError("SOURCE_UNAVAILABLE");
  }
}
