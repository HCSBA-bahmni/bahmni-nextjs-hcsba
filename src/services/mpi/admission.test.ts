import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRunChanged, lookupLocalPatientByRun, lookupMpiIdentityForAdmission, lookupMpiPatientByRun, mpiPatientFormSeed, runFromForm, syncPatientWithMpi } from "./admission";

const runPatient = {
  resourceType: "Patient", id: "openmrs-1", identifier: [{ system: "http://clientregistry.org/nationalid", value: "12345678-5" }],
  name: [{ family: "Prueba", given: ["Persona", "Sintética"], _family: { extension: [{ url: "https://hl7chile.cl/fhir/ig/clcore/StructureDefinition/SegundoApellido", valueString: "EIS" }] } }],
  gender: "female", birthDate: "1990-02-03",
};
const bundle = (patients: unknown[]) => ({ resourceType: "Bundle", type: "searchset", entry: patients.map((resource) => ({ resource })) });
const response = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/fhir+json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("MPI admission contract", () => {
  it("checks OpenMRS for the exact RUN before allowing a new record", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(bundle([runPatient])));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupLocalPatientByRun("12.345.678-5")).resolves.toMatchObject([{ id: "openmrs-1" }]);
    expect(fetchMock).toHaveBeenCalledWith("/openmrs/ws/fhir2/R4/Patient?identifier=12345678-5", expect.objectContaining({ credentials: "include" }));
  });

  it("stops when OpenMRS returns an unverifiable or paginated identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(bundle([{ ...runPatient, identifier: [] }]))));
    await expect(lookupLocalPatientByRun("12345678-5")).rejects.toThrow("no se pueden verificar");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...bundle([runPatient]), total: 2 })));
    await expect(lookupLocalPatientByRun("12345678-5")).rejects.toThrow("más fichas");
  });

  it("finds a legacy CLRUN* identifier through OpenMRS REST before allowing a duplicate", async () => {
    const legacy = { results: [{ uuid: "openmrs-legacy", identifiers: [{ identifier: "CLRUN*12345678-5" }] }] };
    const detail = { ...runPatient, id: "openmrs-legacy", identifier: [{ value: "CLRUN*12345678-5" }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(bundle([])))
      .mockResolvedValueOnce(response(legacy))
      .mockResolvedValueOnce(response(detail));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupLocalPatientByRun("12.345.678-5")).resolves.toMatchObject([{ id: "openmrs-legacy" }]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/ws/rest/v1/patient?q=12345678-5");
  });

  it("blocks an unverified REST candidate instead of interpreting it as absence", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(bundle([])))
      .mockResolvedValueOnce(response({ results: [{ uuid: "candidate", identifiers: [{ identifier: "OTHER-12345678-5" }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupLocalPatientByRun("12345678-5")).rejects.toThrow("posibles fichas heredadas");
  });

  it("requires an explicit MPI outcome and keeps stale separate from no match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(bundle([]), { "X-MPI-Outcome": "no-match", "X-MPI-Stale": "true", "X-MPI-Source": "local", "X-MPI-Purpose": "admision" })));
    await expect(lookupMpiPatientByRun("12345678-5")).resolves.toMatchObject({ outcome: "no-match", stale: true, source: "local", patients: [] });
  });

  it("refreshes a cached local no-match through the national admission channel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(bundle([]), { "X-MPI-Outcome": "no-match", "X-MPI-Stale": "false", "X-MPI-Source": "local", "X-MPI-Purpose": "admision" }))
      .mockResolvedValueOnce(response(bundle([runPatient]), { "X-MPI-Outcome": "match-unique", "X-MPI-Stale": "false", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupMpiIdentityForAdmission("12345678-5")).resolves.toMatchObject({ outcome: "match-unique", source: "minsal" });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("_refresh=true");
  });

  it("rejects a contradictory MPI bundle instead of treating it as no match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(bundle([runPatient]), { "X-MPI-Outcome": "no-match", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" })));
    await expect(lookupMpiPatientByRun("12345678-5")).rejects.toThrow("no coincide");
  });

  it("rejects a response that did not run with admission purpose", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(bundle([]), { "X-MPI-Outcome": "no-match", "X-MPI-Source": "local", "X-MPI-Purpose": "consulta" })));
    await expect(lookupMpiPatientByRun("12345678-5")).rejects.toThrow("no fue autorizada como admisión");
  });

  it("uses the OpenHIM response without creating a second Bahmni patient", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ resultado: "creado", crid: "crid-1", vinculado: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(syncPatientWithMpi("openmrs-1")).resolves.toEqual({ crid: "crid-1" });
    expect(fetchMock).toHaveBeenCalledWith("/openmrs/mpi-admission-gateway/_sync/openmrs-1", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing CRID link pending even when the index write succeeded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ resultado: "actualizado", crid: "crid-1", vinculado: false })));
    await expect(syncPatientWithMpi("openmrs-1")).rejects.toThrow("pendiente");
  });

  it("allows continued care on the verified current chart after consolidation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ resultado: "consolidacion-verificada", crid: "crid-1", vinculado: true, caseId: "case-1", preferredUuid: "openmrs-1" })));
    await expect(syncPatientWithMpi("openmrs-1")).resolves.toEqual({ crid: "crid-1" });
  });

  it.each([
    { resultado: "consolidacion-clinica", preferredUuid: "openmrs-1", vinculado: false },
    { resultado: "consolidacion-verificada", preferredUuid: "another-chart", vinculado: true, crid: "crid-1", caseId: "case-1" },
    { resultado: "consolidacion-verificada", preferredUuid: "openmrs-1", vinculado: false, crid: "crid-1", caseId: "case-1" },
    { resultado: "consolidacion-verificada", preferredUuid: "openmrs-1", vinculado: true, crid: "crid-1" },
  ])("keeps incomplete or wrong-chart consolidation unverified: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(syncPatientWithMpi("openmrs-1")).rejects.toThrow("pendiente");
  });

  it("prefills only the identity subset and carries RUN as a typed additional identifier", () => {
    const types = [{ uuid: "local-type", name: "Patient Identifier", primary: true, identifierSources: [] }, { uuid: "run-type", name: "RUN", primary: false, identifierSources: [] }];
    const seed = mpiPatientFormSeed(runPatient as never, "12345678-5", types as never);
    expect(seed).toMatchObject({ givenName: "Persona Sintética", familyName: "Prueba", familyName2: "EIS", gender: "F", birthDate: "1990-02-03", additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "12345678-5" }] });
    expect(seed).not.toHaveProperty("attributes");
    expect(runFromForm({ ...seed, givenName: "Persona", familyName: "Prueba", gender: "F", attributes: {}, relationships: [] } as never, types as never)).toBe("12345678-5");
    expect(hasRunChanged(seed, { additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "12.345.678-5" }] }, types as never)).toBe(false);
    expect(hasRunChanged(seed, { additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "20347573-K" }] }, types as never)).toBe(true);
  });
});
