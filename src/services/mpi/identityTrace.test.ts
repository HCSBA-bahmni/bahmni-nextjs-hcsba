import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdentityCase } from "./localIdentity";
import { getIdentityCase } from "./localIdentity";
import { currentResourceSummary, eventActor, eventTargets, fhirResourcePath, hasTraceClockDifference, loadPhaseEvidence, readTraceResource, type TraceEvent } from "./identityTrace";

afterEach(() => vi.unstubAllGlobals());
const row = { id: "case", clinical: { operationId: "operation", preferredUuid: "a", secondaryUuid: "b", completedAt: "2026-10-21T14:00:00Z" } } as IdentityCase;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("read-only identity trace", () => {
  it("rejects remote, traversal, query, version, encoded and fragment references before fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const ref of ["https://example.org/Patient/a", "//example.org/Patient/a", "Patient/../User", "Patient/a?x=y", "Patient/a/_history/1", "Patient/%2e%2e", "Patient/a#x", "Patient/a\\b"]) {
      await expect(readTraceResource(ref)).rejects.toThrow("referencia FHIR");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(fhirResourcePath("Patient/a-b.1")).toBe("/openmrs/ws/fhir2/R4/Patient/a-b.1");
  });
  it("uses authenticated GET and refuses a different returned resource", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ resourceType: "Patient", id: "wrong" })); vi.stubGlobal("fetch", fetch);
    await expect(readTraceResource("Patient/a")).rejects.toThrow("distinta");
    expect(fetch).toHaveBeenCalledWith("/openmrs/ws/fhir2/R4/Patient/a", expect.objectContaining({ credentials: "include", cache: "no-store" }));
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });
  it("keeps available audit evidence while reporting missing Provenance of a completed action", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/Provenance/") ? reply({}, 404)
      : reply({ resourceType: "AuditEvent", id: "merge-operation", recorded: "2026-10-21T14:00:00Z" }))));
    const result = await loadPhaseEvidence(row, "merge");
    expect(result.audit?.id).toBe("merge-operation"); expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("Provenance");
  });
  it("does not call an unperformed split a failure, but preserves denied access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(reply({}, 404))));
    expect((await loadPhaseEvidence(row, "split")).issues).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(reply({}, 403))));
    expect((await loadPhaseEvidence(row, "split")).issues).toHaveLength(2);
  });
  it("distinguishes the requesting human from the service account and deduplicates targets", () => {
    const event = { resourceType: "Provenance", id: "merge-operation", agent: [
      { type: { coding: [{ code: "assembler" }] }, who: { identifier: { value: "service" } } },
      { type: { coding: [{ code: "author" }] }, who: { identifier: { value: "gestor" } } },
    ], target: [{ reference: "Patient/a" }, { reference: "Patient/a" }, { reference: "Observation/o" }] } as TraceEvent;
    expect(eventActor(event)).toBe("gestor"); expect(eventTargets(event)).toEqual(["Patient/a", "Observation/o"]);
    expect(eventActor({ resourceType: "AuditEvent", id: "a", agent: [{ requestor: false, who: { identifier: { value: "service" } } }, { requestor: true, who: { identifier: { value: "manager" } } }] })).toBe("manager");
  });
  it("describes actual Patient links and clinical ownership without inventing active status", () => {
    expect(currentResourceSummary({ resourceType: "Patient", id: "b", active: false, link: [{ type: "replaced-by", other: { reference: "Patient/a" } }] })).toBe("Ficha inactiva · Reemplazado por Patient/a");
    expect(currentResourceSummary({ resourceType: "Patient", id: "a" })).toContain("Estado activo no informado");
    expect(currentResourceSummary({ resourceType: "Observation", id: "o", subject: { reference: "Patient/b" }, encounter: { reference: "Encounter/e" } })).toBe("Patient/b · Encounter/e");
  });
  it("preserves optional operational history and clinical metadata in the case reader", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...row, patient: {}, status: "separated", version: 8,
      reason: "Ensayo", requestedBy: "admission", createdAt: "2026-10-21T14:00:00Z", history: [{ event: "clinical-separated", actor: "manager", reason: "Cotejo de documentos", at: "2026-10-21T14:10:00Z" }] })));
    const result = await getIdentityCase("case"); expect(result.history?.[0]?.actor).toBe("manager"); expect(result.clinical?.operationId).toBe("operation");
  });
  it("flags a timezone discrepancy without treating verification seconds as a clock error or rewriting evidence", () => {
    const event: TraceEvent = { resourceType: "Provenance", id: "merge-operation", recorded: "2026-10-21T14:00:00-03:00" };
    expect(hasTraceClockDifference(row, "merge", event)).toBe(true);
    expect(event.recorded).toBe("2026-10-21T14:00:00-03:00");
    expect(hasTraceClockDifference(row, "merge", { ...event, recorded: "2026-10-21T11:00:02-03:00" })).toBe(false);
    expect(hasTraceClockDifference(row, "split", event)).toBe(false);
  });
});
