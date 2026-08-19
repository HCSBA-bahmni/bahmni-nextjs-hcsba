import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuditLogs } from "./adminAudit";

describe("servicio REST de Audit Log", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa el endpoint legacy y normaliza sus mensajes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      auditLogId: 42,
      userId: "superman",
      patientId: "10001",
      eventType: "VIEWED_PATIENT",
      message: 'VIEWED_PATIENT_MESSAGE~{"patientName":"Ana"}',
      dateCreated: "2025-10-08T12:30:00.000Z",
      uuid: "audit-uuid",
      module: "clinical",
    }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAuditLogs({ startFrom: "2025-10-08T03:00:00.000Z", username: "superman", patientId: "10001", lastAuditLogId: 42, prev: true });

    const requestedUrl = String(fetchMock.mock.calls[0]![0]);
    expect(requestedUrl).toContain("/openmrs/ws/rest/v1/auditlog?");
    const params = new URL(requestedUrl, "https://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({ startFrom: "2025-10-08T03:00:00.000Z", username: "superman", patientId: "10001", lastAuditLogId: "42", prev: "true" });
    expect(result[0]).toMatchObject({ auditLogId: 42, messageKey: "VIEWED_PATIENT_MESSAGE", params: { patientName: "Ana" } });
  });
});
