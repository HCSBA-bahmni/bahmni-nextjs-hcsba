import { z } from "zod";
import { MpiAdmissionError } from "./admission";
import type { IdentityCase } from "./localIdentity";

const reference = z.object({ reference: z.string().optional(), display: z.string().optional(),
  identifier: z.object({ value: z.string().optional() }).loose().optional() }).loose();
const coding = z.object({ coding: z.array(z.object({ code: z.string().optional() }).loose()).optional() }).loose();
const resourceSchema = z.object({ resourceType: z.string(), id: z.string() }).loose();
const eventSchema = resourceSchema.extend({ resourceType: z.enum(["Provenance", "AuditEvent"]),
  recorded: z.string().optional(), occurredDateTime: z.string().optional(), outcomeDesc: z.string().optional(),
  reason: z.array(z.object({ text: z.string().optional() }).loose()).optional(),
  agent: z.array(z.object({ who: reference.optional(), requestor: z.boolean().optional(), type: coding.optional() }).loose()).optional(),
  target: z.array(reference).optional(), entity: z.array(z.object({ what: reference.optional() }).loose()).optional(),
});
export type TraceResource = z.infer<typeof resourceSchema>;
export type TraceEvent = z.infer<typeof eventSchema>;
export type TracePhase = "merge" | "split";
export interface PhaseEvidence { phase: TracePhase; provenance?: TraceEvent; audit?: TraceEvent; issues: string[] }
const base = "/openmrs/ws/fhir2/R4/";

// Only literal local instance references. Never follow arbitrary URLs from FHIR payloads.
export function fhirResourcePath(ref: string): string {
  if (!/^[A-Z][A-Za-z]+\/[A-Za-z0-9.-]{1,64}$/.test(ref)) throw new Error("La referencia FHIR no corresponde a una instancia local consultable.");
  return base + ref;
}
export async function readTraceResource(ref: string, signal?: AbortSignal): Promise<TraceResource> {
  const path = fhirResourcePath(ref);
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", cache: "no-store",
      headers: { Accept: "application/fhir+json" }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("No se pudo completar la consulta FHIR. Revise la conexión y actualice para reintentar.");
  }
  if (!response.ok) throw new MpiAdmissionError(response.status === 403 ? "Su perfil no tiene permiso para consultar esta evidencia FHIR."
    : response.status === 404 ? "Este recurso FHIR no está disponible."
    : "No fue posible consultar FHIR. Vuelva a intentar la lectura.", response.status);
  const parsed = resourceSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("FHIR devolvió un contenido que no se puede mostrar como recurso.");
  const resource = parsed.data;
  if (`${resource.resourceType}/${resource.id}` !== ref) throw new Error("FHIR devolvió una instancia distinta de la solicitada.");
  return resource;
}
export async function loadPhaseEvidence(row: IdentityCase, phase: TracePhase, signal?: AbortSignal): Promise<PhaseEvidence> {
  if (!row.clinical) return { phase, issues: [] };
  const result: PhaseEvidence = { phase, issues: [] };
  const responses = await Promise.allSettled((["Provenance", "AuditEvent"] as const).map(async type =>
    eventSchema.parse(await readTraceResource(`${type}/${phase}-${row.clinical!.operationId}`, signal))));
  responses.forEach((response, index) => {
    const type = index === 0 ? "Provenance" : "AuditEvent";
    if (response.status === "fulfilled") {
      if (index === 0) result.provenance = response.value; else result.audit = response.value;
    } else {
      const expected = (phase === "merge" && row.clinical?.clinicalCommitted) || row.history?.some(h => h.event === (phase === "merge" ? "clinical-consolidated" : "clinical-separated"))
        || Boolean(phase === "merge" ? row.clinical?.completedAt : row.clinical?.separatedAt);
      if (expected || !(response.reason instanceof MpiAdmissionError && response.reason.status === 404))
        result.issues.push(`${type}: ${response.reason instanceof Error ? response.reason.message : "Lectura no disponible."}`);
    }
  });
  return result;
}
export function eventActor(event: TraceEvent): string {
  const person = event.agent?.find(a => event.resourceType === "AuditEvent" ? a.requestor === true
    : a.type?.coding?.some(c => c.code === "author"));
  return person?.who?.identifier?.value || person?.who?.display || "Responsable no consignado";
}
export function eventTargets(event: TraceEvent): string[] {
  return [...new Set((event.resourceType === "Provenance" ? event.target : event.entity?.map(e => e.what))
    ?.flatMap(r => r?.reference ? [r.reference] : []) || [])];
}
export const traceActionLabels: Record<string, string> = {
  requested: "Alerta enviada por admisión", same: "Identidad revisada: misma persona", different: "Identidad revisada: personas distintas",
  defer: "Revisión dejada pendiente", "clinical-consolidated": "Fusión de fichas completada", "clinical-separated": "Separación de fichas completada",
};
export function operationalPhaseTime(row: IdentityCase, phase: TracePhase): string | undefined {
  return (phase === "merge" ? row.clinical?.completedAt : row.clinical?.separatedAt)
    || [...(row.history || [])].reverse().find(h => h.event === (phase === "merge" ? "clinical-consolidated" : "clinical-separated"))?.at;
}
export function hasTraceClockDifference(row: IdentityCase, phase: TracePhase, event: TraceEvent): boolean {
  const operational = Date.parse(operationalPhaseTime(row, phase) || "");
  const fhir = Date.parse(event.recorded || event.occurredDateTime || "");
  // Gateway verification may follow a committed transaction by seconds; flag material differences only.
  return Number.isFinite(operational) && Number.isFinite(fhir) && Math.abs(operational - fhir) > 5 * 60 * 1000;
}
export function currentResourceSummary(resource: TraceResource): string {
  if (resource.resourceType === "Patient") {
    const parsed = z.object({ active: z.boolean().optional(), link: z.array(z.object({ type: z.string(), other: reference }).loose()).optional() }).loose().parse(resource);
    const links = parsed.link?.map(l => `${({ replaces: "Reemplaza a", "replaced-by": "Reemplazado por", refer: "Referencia a", seealso: "Relacionado con" } as Record<string, string>)[l.type] || l.type} ${l.other.reference || "referencia no consignada"}`);
    return [parsed.active === undefined ? "Estado activo no informado" : parsed.active ? "Ficha activa" : "Ficha inactiva", ...(links?.length ? links : ["Sin vínculos Patient.link"])].join(" · ");
  }
  const parsed = z.object({ subject: reference.optional(), patient: reference.optional(), encounter: reference.optional() }).loose().parse(resource);
  return [parsed.subject?.reference || parsed.patient?.reference, parsed.encounter?.reference].filter(Boolean).join(" · ") || "Consulte el contenido FHIR para ver sus referencias.";
}
