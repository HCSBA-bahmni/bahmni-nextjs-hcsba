import { beforeEach, describe, expect, it, vi } from "vitest";
import { bahmniRequest, BahmniApiError } from "./http";
import { getPabellonHistory, mergePabellonPages, PabellonReadError, validatePabellonPage } from "./pabellon";

vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequest: vi.fn() }));
const patient = "11111111-1111-4111-8111-111111111111";
const raw = () => ({ schemaVersion: "2", patient: { uuid: patient, hisEnvironment: "bahmni225-dev", identityStatus: "matched", linkVersion: 1 }, observedAt: "2026-10-28T10:00:00Z", correlationId: "22222222-2222-4222-8222-222222222222", nextCursor: null, items: [{ id: "3", source: { system: "pabellon-hcsba-qa", environment: "qa-isolated", endpointEnvironment: "qa-isolated227", id: "3", observedAt: "2026-10-28T10:00:00Z", revision: null }, requestSnapshot: { status: "unavailable", snapshotId: null, version: null, capturedAt: null }, request: null, warningCodes: ["REQUEST_SNAPSHOT_UNAVAILABLE"] }] });

describe("Pabellón snapshot contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserves a missing snapshot without clinical fallback", () => {
    expect(validatePabellonPage(raw(), patient).items[0]?.request).toBeNull();
  });
  it.each(["patient", "source", "version", "metadata", "duplicate", "capture"])("rejects mismatched %s", (kind) => {
    const value = raw();
    if (kind === "patient") value.patient.uuid = "33333333-3333-4333-8333-333333333333";
    if (kind === "source") value.items[0]!.source.system = "pabellon-hcsba";
    if (kind === "version") value.schemaVersion = "1";
    if (kind === "metadata") value.items[0]!.requestSnapshot.status = "available";
    if (kind === "duplicate") value.items.push(structuredClone(value.items[0]!));
    if (kind === "capture") value.items[0]!.source.observedAt = "2026-10-27T10:00:00Z";
    expect(() => validatePabellonPage(value, patient)).toThrow(PabellonReadError);
  });
  it("does not silently merge duplicate rows across pages", () => {
    const page = validatePabellonPage(raw(), patient);
    expect(() => mergePabellonPages([page, page])).toThrow(PabellonReadError);
  });
  it("sends only fixed native patient path and opaque filters", async () => {
    vi.mocked(bahmniRequest).mockResolvedValue(raw());
    const controller = new AbortController();
    await getPabellonHistory(patient, "OPAQUE-CURSOR", controller.signal);
    expect(bahmniRequest).toHaveBeenCalledWith(expect.stringContaining("/pabellon-gateway/v1/patients/" + patient + "/surgeries?"), expect.objectContaining({ cache: "no-store", skipUnauthorizedEvent: true, signal: controller.signal }));
    expect(vi.mocked(bahmniRequest).mock.calls[0]![0]).toContain("cursor=OPAQUE-CURSOR");
  });
  it("retains known safe error codes without exposing raw server details", async () => {
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(503, "PRIVATE_RESPONSE", { code: "AUDIT_UNAVAILABLE", patient: "DO_NOT_SHOW" }));
    await expect(getPabellonHistory(patient, undefined)).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE" });
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(500, "PRIVATE_RESPONSE", { code: "PRIVATE_RESPONSE" }));
    await expect(getPabellonHistory(patient, undefined)).rejects.not.toHaveProperty("message", expect.stringContaining("PRIVATE"));
  });
  it("rejects invalid identity before fetching", async () => {
    await expect(getPabellonHistory("INVALID", undefined)).rejects.toMatchObject({ code: "INVALID_FILTER" });
    expect(bahmniRequest).not.toHaveBeenCalled();
  });
});
