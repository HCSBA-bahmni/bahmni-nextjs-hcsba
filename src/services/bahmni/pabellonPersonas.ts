import { z } from "zod";
import { bahmniRequest, BahmniApiError } from "./http";

const text = (max: number) => z.string().refine(v => [...v].length <= max && v === v.trim() && v.toUpperCase() !== "NULL" && !/[\u0000-\u001f\u007f-\u009f]/u.test(v));
const record = z.object({
  names: text(100).refine(v => !!v), firstSurname: text(100).refine(v => !!v), secondSurname: text(100),
  birthDate: z.iso.date(), sexCode: text(10), telephone: text(20), address: text(255), addressNumber: text(20),
  communeCode: text(10), insuranceCode: text(10), insuranceSegment: text(1),
  comgesMatch: z.boolean().optional(),
}).strict();
const response = z.object({ record, digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type PabellonPersonasPrefill = z.infer<typeof response>;
export class PabellonPersonasError extends Error {
  constructor(public readonly code: string) {
    super(({ PERSONAS_NOT_FOUND: "No se encontró el paciente en Personas. No se registró ni modificó ninguna persona.", PERSONAS_IDENTITY_CONFLICT: "El RUT y el registro de Personas no coinciden. Se requiere revisar la identidad antes de continuar.", PATIENT_CONTEXT_MISMATCH: "La identidad del paciente requiere revisión.", REQUEST_CREATE_FORBIDDEN: "La sesión no tiene permiso para consultar esta precarga.", SESSION_REQUIRED: "Inicie sesión para consultar Personas." } as Record<string, string>)[code] ?? "No fue posible consultar Personas. No se utilizarán datos de otro paciente ni valores de relleno.");
  }
}
export function validatePersonasPrefill(raw: unknown): PabellonPersonasPrefill {
  const parsed = response.safeParse(raw);
  if (!parsed.success) throw new PabellonPersonasError("SOURCE_CONTRACT_MISMATCH");
  return parsed.data;
}
export async function getPabellonPersonasPrefill(patientUuid: string, signal?: AbortSignal) {
  if (!z.uuid().safeParse(patientUuid).success) throw new PabellonPersonasError("PATIENT_CONTEXT_MISMATCH");
  try {
    return validatePersonasPrefill(await bahmniRequest<unknown>("/pabellon-gateway/v1/patients/" + patientUuid + "/request-prefill", { signal, cache: "no-store", skipUnauthorizedEvent: true }));
  } catch (error) {
    if (error instanceof PabellonPersonasError || signal?.aborted) throw error;
    if (error instanceof BahmniApiError) {
      const p = z.object({ code: z.string() }).passthrough().safeParse(error.payload);
      const statuses: Record<string, number> = { PERSONAS_NOT_FOUND: 404, PERSONAS_IDENTITY_CONFLICT: 409, PATIENT_CONTEXT_MISMATCH: 409, REQUEST_CREATE_FORBIDDEN: 403, SESSION_REQUIRED: 401 };
      if (p.success && statuses[p.data.code] === error.status) throw new PabellonPersonasError(p.data.code);
    }
    throw new PabellonPersonasError("SOURCE_UNAVAILABLE");
  }
}
