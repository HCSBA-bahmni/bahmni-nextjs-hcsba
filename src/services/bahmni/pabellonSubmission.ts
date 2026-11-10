import { z } from "zod";
import { bahmniRequestWithResponse, BahmniApiError } from "./http";

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const contextSchema = z.object({ actorUuid: uuid, patientUuid: uuid, visitUuid: uuid, encounterUuid: z.union([uuid, z.literal("")]), sourceEnvironment: z.enum(["qa-isolated", "pabellon43-dev"]).optional() }).strict();
export type PabellonSubmissionContext = z.infer<typeof contextSchema>;
const text = (max: number, required = true) => z.string().refine((value) => [...value].length <= max && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value) && value.toUpperCase() !== "NULL" && (!required || value.length > 0));
const detailsSchema = z.object({
  personasDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  telephone: text(20), address: text(255), addressNumber: text(20), communeId: z.number().int().positive().max(2147483647),
  communeName: text(100), insuranceCode: z.number().int().min(0).max(2147483647), insuranceName: text(50), insuranceSegment: text(1, false),
  sexCode: z.number().int().positive().max(2147483647).optional(), sexName: text(20).optional(),
}).strict().refine((value) => (value.sexCode === undefined) === (value.sexName === undefined));
const allowedClinical = new Set(["cirujano", "nombre_cirujano", "id_especialidad", "diagnostico", "alergico", "asa_id", "duracion", "plan_quirurgico_esp", "lateralidad", "tipo_lateralidad", "paciente_oncologico", "paciente_hospitalizado", "servicio_cama_salida_id", "prioridad_id", "condiciones_prioridad", "tipo_cirugia_id", "tipo_atencion_cirugia_id", "tipo_biopsia_id", "id_prioridad_paciente", "re_intervencion", "tipo_prioridad_id", "id_pabellon", "servicio_origen_id", "servicio_ingreso_id", "plan_quirurgico", "evaluacion_preoperatoria", "evaluacion_preoperatoria_otros", "muestra_sangre_id", "grupo_sanguineo_id", "descripcion_muestra_sangre", "rh", "donante", "motivo_hospitalizacion_previa", "id_prev_hosp_dias", "hospitalizacion_previa", "id_via_abordaje", "id_tipo_via", "checklist_enfermeria"]);
const clinicalValue = z.union([z.string(), z.number().int(), z.boolean(), z.null(), z.array(z.number().int()).max(2000)]);
allowedClinical.add("dispositivos_solicitados");
allowedClinical.add("insumos_opcionales");
const inputSchema = z.object({ patientDetails: detailsSchema, clinical: z.record(z.string(), clinicalValue).refine((value) => Object.keys(value).length > 0 && Object.keys(value).every((key) => allowedClinical.has(key))) }).strict();
export interface PabellonSubmissionInput { patientDetails: z.infer<typeof detailsSchema>; clinical: Record<string, string | number | boolean | null | number[]> }
const nativeId = z.string().regex(/^[1-9][0-9]*$/).refine((value) => BigInt(value) <= 9223372036854775807n);
const receiptSchema = z.object({
  sendId: uuid, correlationId: uuid, result: z.object({
    surgeryId: nativeId, requestNumber: nativeId.refine((value) => BigInt(value) <= 2147483647n), stateAtCreation: z.literal(1),
  }).strict(),
}).strict();
export type PabellonSubmissionReceipt = z.infer<typeof receiptSchema>;
export type PabellonSubmissionPhase = "editable" | "submitting" | "recovery-required" | "recovering" | "confirmed";
const publicError = z.object({ code: z.string(), message: z.string(), correlationId: uuid, retryable: z.literal(false), sendId: uuid, recoveryRequired: z.boolean() }).strict();
const messages: Record<string, string> = {
  PENDING_SEND_EXISTS: "Ya existe un envío pendiente para este paciente y usuario. Verifique esa misma referencia.",
  CREATION_INPUT_INVALID: "Revise los datos de la solicitud antes de enviarla.",
  CONTEXT_CHANGED: "Cambió el usuario, paciente o atención. No se envió la solicitud.",
  SESSION_REQUIRED: "Inicie sesión con el mismo usuario para verificar el envío pendiente.",
  REQUEST_CREATE_FORBIDDEN: "No dispone de autorización vigente. Conserve la referencia del envío.",
  PATIENT_CONTEXT_MISMATCH: "La atención o identidad requiere revisión. Conserve la referencia del envío.",
  IDENTITY_UNRESOLVED: "La identidad requiere conciliación. Conserve la referencia del envío.",
  IDENTITY_AMBIGUOUS: "La identidad es ambigua. Conserve la referencia del envío.",
  IDENTITY_CONFLICT: "Los identificadores cambiaron. Conserve la referencia del envío.",
  SEND_CONTENT_CONFLICT: "Existe un envío con esta referencia. Verifique su recibo; no cree otro envío.",
  SEND_NOT_CONFIRMED: "Aún no hay un recibo confirmado. Esto no demuestra que la solicitud no se haya registrado. Verifique el mismo envío.",
  SUBMISSION_OUTCOME_UNKNOWN: "No fue posible confirmar el resultado. Verifique el mismo envío; no cree otra solicitud.",
};
interface PendingReference { context: Readonly<PabellonSubmissionContext>; sendId: string }
// Only technical context: no names, clinical payloads, tokens or credentials.
// Scoped to browser + environment + actor + patient; not an authorization source.
const pendingReferences = new Map<string, PendingReference>();
type PendingContext = Pick<PabellonSubmissionContext, "actorUuid" | "patientUuid" | "sourceEnvironment">;
const pendingKey = (context: PendingContext) => (context.sourceEnvironment ?? "qa-isolated") + ":" + context.actorUuid + ":" + context.patientUuid;
const storageKey = (context: PendingContext) => "hcsba:pabellon:pending:v1:" + pendingKey(context);
const savedReference = z.object({ context: contextSchema, sendId: uuid }).strict();
export function getPendingPabellonReference(context: PendingContext): PendingReference | undefined {
  let pending = pendingReferences.get(pendingKey(context));
  if (!pending && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storageKey(context));
      const parsed = raw ? savedReference.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success && pendingKey(parsed.data.context) === pendingKey(context)) {
        pending = parsed.data; pendingReferences.set(pendingKey(context), pending);
      }
    } catch { /* Unavailable storage never exposes another patient's reference. */ }
  }
  return pending ? { context: { ...pending.context }, sendId: pending.sendId } : undefined;
}
export class PabellonSubmissionError extends Error {
  constructor(public readonly code: string, public readonly recoveryRequired: boolean) {
    super(messages[code] ?? messages.SUBMISSION_OUTCOME_UNKNOWN); this.name = "PabellonSubmissionError";
  }
}
function safeFailure(error: unknown, sendId: string, recovery: boolean): PabellonSubmissionError {
  if (error instanceof BahmniApiError) {
    const parsed = publicError.safeParse(error.payload);
    if (parsed.success && parsed.data.sendId === sendId) {
      const value = parsed.data;
      if (!recovery && (error.status === 400 || error.status === 422) && value.code === "CREATION_INPUT_INVALID" && value.recoveryRequired === false) return new PabellonSubmissionError(value.code, false);
      const expected: Record<string, number> = { SESSION_REQUIRED: 401, REQUEST_CREATE_FORBIDDEN: 403, PATIENT_CONTEXT_MISMATCH: 409, IDENTITY_UNRESOLVED: 409, IDENTITY_AMBIGUOUS: 409, IDENTITY_CONFLICT: 409, SEND_CONTENT_CONFLICT: 409, SEND_NOT_CONFIRMED: 404, SUBMISSION_OUTCOME_UNKNOWN: 503 };
      if (expected[value.code] === error.status) return new PabellonSubmissionError(value.code, true);
    }
  }
  return new PabellonSubmissionError("SUBMISSION_OUTCOME_UNKNOWN", true);
}
/** One logical send. Persists only its recovery reference, never clinical data. */
export class PabellonSubmission {
  readonly context: Readonly<PabellonSubmissionContext>;
  readonly sendId: string;
  private phaseValue: PabellonSubmissionPhase;
  private inFlight?: Promise<PabellonSubmissionReceipt>;
  private confirmed?: PabellonSubmissionReceipt;
  private errorValue: PabellonSubmissionError | null = null;
  constructor(context: PabellonSubmissionContext, recoverySendId?: string) {
    const parsed = contextSchema.safeParse(context);
    if (!parsed.success || recoverySendId !== undefined && !uuid.safeParse(recoverySendId).success) throw new PabellonSubmissionError("CONTEXT_CHANGED", false);
    this.context = Object.freeze({ ...parsed.data });
    this.sendId = recoverySendId ?? crypto.randomUUID();
    this.phaseValue = recoverySendId ? "recovery-required" : "editable";
  }
  get phase() { return this.phaseValue; }
  get receipt() { return this.confirmed; }
  get error() { return this.errorValue; }
  private assertContext(current: PabellonSubmissionContext) {
    if (!contextSchema.safeParse(current).success || (this.context.sourceEnvironment ?? "qa-isolated") !== (current.sourceEnvironment ?? "qa-isolated") || ["actorUuid", "patientUuid", "visitUuid", "encounterUuid"].some((key) => this.context[key as keyof PabellonSubmissionContext] !== current[key as keyof PabellonSubmissionContext])) throw new PabellonSubmissionError("CONTEXT_CHANGED", this.phaseValue !== "editable");
  }
  submit(current: PabellonSubmissionContext, input: PabellonSubmissionInput): Promise<PabellonSubmissionReceipt> {
    try {
      this.assertContext(current);
      if (this.inFlight) return this.inFlight;
      if (this.confirmed) return Promise.resolve(this.confirmed);
      if (this.phaseValue !== "editable") throw new PabellonSubmissionError("SUBMISSION_OUTCOME_UNKNOWN", true);
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data.clinical)).length > 8192) throw new PabellonSubmissionError("CREATION_INPUT_INVALID", false);
      const body = JSON.stringify({ sendId: this.sendId, visitUuid: this.context.visitUuid, encounterUuid: this.context.encounterUuid, ...parsed.data });
      if (new TextEncoder().encode(body).length > 32768) throw new PabellonSubmissionError("CREATION_INPUT_INVALID", false);
      return this.start(body, false);
    } catch (error) { return Promise.reject(error); }
  }
  recover(current: PabellonSubmissionContext): Promise<PabellonSubmissionReceipt> {
    try {
      this.assertContext(current);
      if (this.inFlight) return this.inFlight;
      if (this.confirmed) return Promise.resolve(this.confirmed);
      if (this.phaseValue !== "recovery-required") throw new PabellonSubmissionError("CREATION_INPUT_INVALID", false);
      return this.start(JSON.stringify({ sendId: this.sendId, visitUuid: this.context.visitUuid, encounterUuid: this.context.encounterUuid }), true);
    } catch (error) { return Promise.reject(error); }
  }
  private start(body: string, recovery: boolean) {
    const key = pendingKey(this.context);
    const other = getPendingPabellonReference(this.context);
    if (other && other.sendId !== this.sendId) throw new PabellonSubmissionError("PENDING_SEND_EXISTS", true);
    try {
      window.localStorage.setItem(storageKey(this.context), JSON.stringify({ context: this.context, sendId: this.sendId }));
    } catch {
      if (!recovery) throw new Error("No se pudo conservar la referencia en este navegador. Habilite el almacenamiento antes de enviar; no se envió la solicitud.");
    }
    pendingReferences.set(key, { context: this.context, sendId: this.sendId });
    this.phaseValue = recovery ? "recovering" : "submitting"; this.errorValue = null;
    // Assign before callers can trigger another click; do not use query retries.
    const work = this.exchange(body, recovery).finally(() => { this.inFlight = undefined; });
    this.inFlight = work; return work;
  }
  private async exchange(body: string, recovery: boolean): Promise<PabellonSubmissionReceipt> {
    // A cancelled/timed-out WRITE is an unknown outcome, never proof of rollback.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await bahmniRequestWithResponse<unknown>("/pabellon-gateway/v1/patients/" + this.context.patientUuid + "/requests" + (recovery ? "/recover" : ""), {
        method: "POST", body, cache: "no-store", skipUnauthorizedEvent: true, signal: controller.signal,
      });
      const parsed = receiptSchema.safeParse(response.data);
      if (response.status !== (recovery ? 200 : 201) || response.headers.get("Cache-Control") !== "no-store" || !parsed.success || parsed.data.sendId !== this.sendId) throw new Error("UNCONFIRMED_RECEIPT");
      this.confirmed = Object.freeze({ ...parsed.data, result: Object.freeze({ ...parsed.data.result }) });
      this.phaseValue = "confirmed"; return this.confirmed;
    } catch (error) {
      const safe = safeFailure(error, this.sendId, recovery);
      this.errorValue = safe; this.phaseValue = safe.recoveryRequired ? "recovery-required" : "editable";
      throw safe;
    } finally {
      clearTimeout(timer);
      if ((this.phaseValue === "confirmed" || this.phaseValue === "editable") && getPendingPabellonReference(this.context)?.sendId === this.sendId) {
        pendingReferences.delete(pendingKey(this.context));
        try { window.localStorage.removeItem(storageKey(this.context)); } catch { /* Retain a recoverable reference if browser cleanup fails. */ }
      }
    }
  }
}
