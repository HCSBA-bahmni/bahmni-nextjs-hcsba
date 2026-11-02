import { beforeEach, describe, expect, it, vi } from "vitest";
import { bahmniRequest, BahmniApiError } from "./http";
import { getPabellonProtocols, PabellonProtocolError, validateProtocolHistory } from "./pabellonProtocols";
vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequest: vi.fn() }));
const patient = "11111111-1111-4111-8111-111111111111";
const raw = () => ({ schemaVersion: "1", patient: { uuid: patient, hisEnvironment: "bahmni225-dev", identityStatus: "matched", linkVersion: 1 }, surgeryId: "110", source: { system: "pabellon-hcsba-qa", environment: "qa-isolated", endpointEnvironment: "qa-isolated227", id: "110", observedAt: "2026-10-28T12:00:00Z", revision: null }, families: [{ family: "surgeon", status: "available", latestPublishedVersion: 1, withheldVersions: 1, warningCodes: ["AMENDMENT_CLINICAL_REVIEW_REQUIRED"], versions: [{ snapshotId: "201", protocolId: "101", version: 1, amendment: false, contentSource: "protocol-snapshot", closedAt: { rawValue: "2026-10-28 08:00:00", sourceTimezone: null, normalizedInstant: null, interpretation: "unresolved" }, capturedAt: null, digitalSignature: "not-established", sourceDataSHA256: "a".repeat(64), clinical: { patientAtRegistration: { givenNames: "FROZEN NAME", familyName: "FROZEN FAMILY", secondFamilyName: null }, diagnosis: null, surgicalDetail: "FROZEN DETAIL", observations: null, surgeon: null, laterality: null, additionalProcedure: null, procedures: [], team: [] } }] }, { family: "responsible", status: "no-published-versions", latestPublishedVersion: null, withheldVersions: 0, warningCodes: [], versions: [] }], correlationId: "22222222-2222-4222-8222-222222222222" });
describe("Pabellón protocols contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserves publication boundaries, absence and unresolved closure", () => {
    const out = validateProtocolHistory(raw(), patient, "110");
    expect(out.families[0]?.versions[0]?.clinical.patientAtRegistration?.givenNames).toBe("FROZEN NAME");
    expect(out.families[0]?.withheldVersions).toBe(1);
    expect(out.families[1]?.versions).toEqual([]);
    expect(out.families[0]?.versions[0]?.digitalSignature).toBe("not-established");
  });
  it.each(["patient", "surgery", "source", "family", "signature", "closure", "duplicate", "latest", "blocked", "unexpectedField"])("rejects a mismatched %s", (kind) => {
    const value = raw(); const item = value.families[0]!.versions[0]!;
    if (kind === "patient") value.patient.uuid = "33333333-3333-4333-8333-333333333333";
    if (kind === "surgery") value.surgeryId = "999";
    if (kind === "source") value.source.system = "pabellon-hcsba";
    if (kind === "family") value.families.reverse();
    if (kind === "signature") item.digitalSignature = "signed";
    if (kind === "closure") item.closedAt.rawValue = "";
    if (kind === "duplicate") value.families[0]!.versions = [structuredClone(item), structuredClone(item)];
    if (kind === "latest") value.families[0]!.latestPublishedVersion = 2;
    if (kind === "blocked") value.families[0]!.status = "ambiguous";
    if (kind === "unexpectedField") Object.assign(item.clinical, { run_cirujano: "DO_NOT_PUBLISH" });
    expect(() => validateProtocolHistory(value, patient, "110")).toThrow(PabellonProtocolError);
  });
  it("uses only the same-origin patient/surgery route with cancellation", async () => {
    vi.mocked(bahmniRequest).mockResolvedValue(raw()); const controller = new AbortController();
    await getPabellonProtocols(patient, "110", controller.signal);
    expect(bahmniRequest).toHaveBeenCalledWith(`/pabellon-gateway/v1/patients/${patient}/surgeries/110/protocols`, expect.objectContaining({ cache: "no-store", skipUnauthorizedEvent: true, signal: controller.signal }));
  });
  it.each(["invalid", "0", "0110", "9223372036854775808"])("rejects invalid surgery %s before requesting", async (id) => {
    await expect(getPabellonProtocols(patient, id)).rejects.toMatchObject({ code: "INVALID_FILTER" }); expect(bahmniRequest).not.toHaveBeenCalled();
  });
  it("maps errors without exposing clinical details or logging out globally", async () => {
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(503, "PRIVATE_RESPONSE", { code: "AUDIT_UNAVAILABLE" }));
    await expect(getPabellonProtocols(patient, "110")).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE" });
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(403, "PRIVATE_RESPONSE", { code: "PRIVATE_RESPONSE" }));
    await expect(getPabellonProtocols(patient, "110")).rejects.toMatchObject({ code: "PROTOCOL_READ_FORBIDDEN" });
  });
});
