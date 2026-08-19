import { describe, expect, it } from "vitest";
import { auditLogIndexes, buildAuditLogRequest, displayEntriesForAction, isFutureAuditLogDay, parseAuditLogEntry, type AuditLogEntry } from "./auditLog";

const startFrom = new Date("2025-10-08T03:00:00.000Z");
const filters = { startFrom, username: "superman", patientId: "10001" };
const entries: AuditLogEntry[] = [
  { auditLogId: 20, userId: "superman", patientId: "10001", eventType: "VIEWED_PATIENT", messageKey: "VIEWED_PATIENT_MESSAGE", dateCreated: "2025-10-08T12:00:00Z", module: "clinical" },
  { auditLogId: 19, userId: "superman", patientId: "10001", eventType: "VIEWED_PATIENT", messageKey: "VIEWED_PATIENT_MESSAGE", dateCreated: "2025-10-08T11:00:00Z", module: "clinical" },
];

describe("contrato legado de Audit Log", () => {
  it("solicita la vista inicial desde el comienzo del día y sin filtros de usuario o paciente", () => {
    expect(buildAuditLogRequest(filters, "initial")).toEqual({ startFrom: startFrom.toISOString(), defaultView: true });
  });

  it("omite filtros vacíos al filtrar", () => {
    expect(buildAuditLogRequest({ startFrom, username: "", patientId: undefined }, "filter")).toEqual({ startFrom: startFrom.toISOString() });
  });

  it("envía el último id al avanzar y el primero con prev al retroceder", () => {
    const indexes = { first: 20, last: 19 };
    expect(buildAuditLogRequest(filters, "next", indexes)).toEqual({ startFrom: startFrom.toISOString(), username: "superman", patientId: "10001", lastAuditLogId: 19 });
    expect(buildAuditLogRequest(filters, "previous", indexes)).toEqual({ startFrom: startFrom.toISOString(), username: "superman", patientId: "10001", lastAuditLogId: 20, prev: true });
  });

  it("vuelve a la vista por defecto cuando ambos índices son cero", () => {
    expect(buildAuditLogRequest(filters, "previous", { first: 0, last: 0 })).toEqual({ startFrom: startFrom.toISOString(), defaultView: true });
  });

  it("invierte únicamente la respuesta de la vista por defecto", () => {
    expect(displayEntriesForAction(entries, "initial").map((entry) => entry.auditLogId)).toEqual([19, 20]);
    expect(displayEntriesForAction(entries, "filter").map((entry) => entry.auditLogId)).toEqual([20, 19]);
  });

  it("calcula índices y conserva los anteriores cuando una página viene vacía", () => {
    expect(auditLogIndexes(entries)).toEqual({ first: 20, last: 19 });
    expect(auditLogIndexes([], { first: 20, last: 19 })).toEqual({ first: 20, last: 19 });
  });

  it("separa la clave del mensaje y sus parámetros JSON", () => {
    expect(parseAuditLogEntry({ auditLogId: 1, userId: 7, patientId: 9, eventType: "REPORT_OPENED", message: 'REPORT_OPENED_MESSAGE~{"reportName":"Daily"}', dateCreated: 1, module: "reports" })).toMatchObject({
      auditLogId: 1,
      userId: "7",
      patientId: "9",
      messageKey: "REPORT_OPENED_MESSAGE",
      params: { reportName: "Daily" },
    });
  });

  it("rechaza sólo fechas de días futuros, como la validación legacy", () => {
    const now = new Date(2025, 9, 8, 9, 0, 0);
    expect(isFutureAuditLogDay(new Date(2025, 9, 8, 23, 59, 0), now)).toBe(false);
    expect(isFutureAuditLogDay(new Date(2025, 9, 9, 0, 0, 0), now)).toBe(true);
  });
});
