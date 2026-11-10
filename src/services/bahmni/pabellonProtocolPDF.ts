import { openmrsBase } from "./http";
export class PabellonPDFError extends Error {
  constructor(public readonly code: string) {
    const messages: Record<string, string> = {
      SESSION_REQUIRED: "Inicie sesión para consultar el PDF.", FORBIDDEN: "La sesión no tiene permiso para consultar este PDF.",
      NOT_FOUND: "Esta versión no tiene un PDF publicable para el paciente seleccionado.", CONTEXT: "La selección cambió. Vuelva a abrir el protocolo.",
      CONTRACT: "No fue posible verificar la integridad del PDF.", UNAVAILABLE: "No fue posible obtener el PDF. Inténtelo nuevamente.",
    };
    super(messages[code] ?? messages.UNAVAILABLE); this.name = "PabellonPDFError";
  }
}
const numericId = (value: string) => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const digestPattern = /^[a-f0-9]{64}$/;
export const PDF_RENDERER = "b48-pabellon-protocolo-2026.10.29.1";
export async function getPabellonProtocolPDF(patientUuid: string, surgeryId: string, snapshotId: string, sourceHash: string, signal: AbortSignal): Promise<Blob> {
  if (openmrsBase !== "/openmrs" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(patientUuid) || !numericId(surgeryId) || !numericId(snapshotId) || !digestPattern.test(sourceHash)) throw new PabellonPDFError("CONTEXT");
  try {
    const response = await fetch(`${openmrsBase}/pabellon-gateway/v1/patients/${patientUuid}/surgeries/${surgeryId}/protocols/${snapshotId}/pdf`, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      headers: { Accept: "application/pdf", "Disable-WWW-Authenticate": "true" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new PabellonPDFError(({ 401: "SESSION_REQUIRED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONTEXT" } as Record<number, string>)[response.status] ?? "UNAVAILABLE");
    }
    const pdfHash = response.headers.get("X-Pabellon-PDF-SHA256") ?? "";
    if (response.headers.get("Content-Type")?.split(";")[0] !== "application/pdf" || !digestPattern.test(pdfHash) || response.headers.get("X-Pabellon-Source-SHA256") !== sourceHash || response.headers.get("X-Pabellon-Renderer") !== PDF_RENDERER || !response.body) {
      await response.body?.cancel(); throw new PabellonPDFError("CONTRACT");
    }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        total += part.value.length;
        if (total > 512 * 1024) { await reader.cancel(); throw new PabellonPDFError("CONTRACT"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    if (total < 16 || new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-") throw new PabellonPDFError("CONTRACT");
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data.buffer))).map((v) => v.toString(16).padStart(2, "0")).join("");
    signal.throwIfAborted();
    if (actual !== pdfHash) throw new PabellonPDFError("CONTRACT");
    return new Blob([data.buffer], { type: "application/pdf" });
  } catch (error) {
    if (signal.aborted || error instanceof PabellonPDFError) throw error;
    throw new PabellonPDFError("UNAVAILABLE");
  }
}
