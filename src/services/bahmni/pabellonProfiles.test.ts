import { describe, expect, it } from "vitest";
import { DEV_PABELLON_SOURCE as DEV, QA_PABELLON_SOURCE as QA, type PabellonSource, validatePabellonPage, mergePabellonPages } from "./pabellon";
import { validateProtocolHistory } from "./pabellonProtocols";
const patient = "11111111-1111-4111-8111-111111111111";
const page = (profile: PabellonSource, id = "3") => ({ schemaVersion: "2", patient: { uuid: patient, hisEnvironment: profile.his, identityStatus: "matched", linkVersion: 1 }, observedAt: "2026-11-04T12:00:00Z", correlationId: "22222222-2222-4222-8222-222222222222", nextCursor: null, items: [{ id, source: { system: profile.system, environment: profile.environment, endpointEnvironment: profile.endpoint, id, observedAt: "2026-11-04T12:00:00Z", revision: null }, requestSnapshot: { status: "unavailable", snapshotId: null, version: null, capturedAt: null }, request: null, warningCodes: ["REQUEST_SNAPSHOT_UNAVAILABLE"] }] });
const protocols = (profile: PabellonSource) => ({ schemaVersion: "1", patient: { uuid: patient, hisEnvironment: profile.his, identityStatus: "matched", linkVersion: 1 }, surgeryId: "3", source: { system: profile.system, environment: profile.environment, endpointEnvironment: profile.endpoint, id: "3", observedAt: "2026-11-04T12:00:00Z", revision: null }, families: ["surgeon", "responsible"].map((family) => ({ family, status: "no-published-versions", latestPublishedVersion: null, withheldVersions: 0, versions: [], warningCodes: [] })), correlationId: "22222222-2222-4222-8222-222222222222" });
describe("Explicit Pabellón DEV source profile", () => {
  it("preserves QA by default and requires explicit DEV", () => {
    expect(validatePabellonPage(page(QA), patient).items).toHaveLength(1);
    expect(validatePabellonPage(page(DEV), patient, DEV).items).toHaveLength(1);
    expect(() => validatePabellonPage(page(DEV), patient)).toThrow();
    expect(() => validatePabellonPage(page(QA), patient, DEV)).toThrow();
  });
  it("does not merge pages from different source scopes", () => {
    const qa = validatePabellonPage(page(QA), patient);
    const dev = validatePabellonPage(page(DEV, "2"), patient, DEV);
    expect(() => mergePabellonPages([qa, dev])).toThrow();
    expect(() => mergePabellonPages([qa, dev], DEV)).toThrow();
    expect(mergePabellonPages([dev], DEV)).toHaveLength(1);
  });
  it("binds protocol histories to the same selected source", () => {
    expect(validateProtocolHistory(protocols(DEV), patient, "3", DEV).families).toHaveLength(2);
    expect(() => validateProtocolHistory(protocols(DEV), patient, "3")).toThrow();
    expect(() => validateProtocolHistory(protocols(QA), patient, "3", DEV)).toThrow();
  });
  it("rejects a production profile even if payload and caller agree", () => {
    const production = { ...DEV, environment: "production", endpoint: "prod12" } as unknown as PabellonSource;
    expect(() => validatePabellonPage(page(production), patient, production)).toThrow();
    expect(() => validateProtocolHistory(protocols(production), patient, "3", production)).toThrow();
  });
});
