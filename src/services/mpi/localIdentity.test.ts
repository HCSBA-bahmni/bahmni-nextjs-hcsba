import { describe, it, expect, vi } from "vitest";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";
import { identityFromForm, matchLocalIdentity, getIdentityCapabilities, valuesForPendingReview } from "./localIdentity";
import { syncPatientWithMpi } from "./admission";

const types = [{ uuid: "passport", name: "Pasaporte" }, { uuid: "run", name: "RUN" }] as IdentifierType[];
const map = [{ name: "Pasaporte", teiTypeCode: "05" }, { name: "RUN", teiTypeCode: "01", issuerCountryCode: "152" }];
const values = { givenName: "Persona", familyName: "Prueba", familyName2: "Identidad", gender: "F", birthDate: "1990-01-02",
  additionalIdentifiers: [{ identifierTypeUuid: "passport", identifier: "P000123", metadata: { typeCode: "4", use: "official", issuerCountryCode: "604" } }] } as PatientFormValues;

describe("local MPI identity", () => {
  it("holds the RUN proposal while retaining the passport, clinical UUID and original form", () => {
    const proposed = { ...values, uuid: "existing-chart", additionalIdentifiers: [...values.additionalIdentifiers!, { identifierTypeUuid: "run", identifier: "12345678-5" }] };
    const sanitized = valuesForPendingReview(proposed, types, { caseId: "case-1", heldRun: "12345678-5" });
    expect(sanitized.uuid).toBe("existing-chart"); expect(sanitized.additionalIdentifiers).toHaveLength(1);
    expect(sanitized.additionalIdentifiers?.[0]?.identifier).toBe("P000123"); expect(proposed.additionalIdentifiers).toHaveLength(2);
  });
  it("accepts an acknowledged pending case without inventing an associated CRID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ resultado: "revision-pendiente", caseId: "case-1", vinculado: false }))));
    await expect(syncPatientWithMpi("existing-chart", { caseId: "case-1" })).resolves.toEqual({});
    vi.unstubAllGlobals();
  });
  it("projects the configured passport and its issuer without inventing a RUN", () => {
    const patient = identityFromForm(values, types, map);
    expect(patient.identifier).toHaveLength(1);
    expect(patient.identifier[0]?.value).toBe("P000123");
    expect(patient.identifier[0]?.type.coding[0]?.code).toBe("05");
    expect(patient.identifier[0]?.type.extension?.[0]?.valueCodeableConcept.coding[0]?.code).toBe("604");
    expect(patient.name[0]?._family?.extension[0]?.valueString).toBe("Identidad");
  });
  it("uses only the same-origin gateway and includes the existing UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "signed", provider: "opencr", candidates: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await matchLocalIdentity(identityFromForm(values, types, map), "existing-uuid");
    expect(fetchMock).toHaveBeenCalledWith("/openmrs/mpi-admission-gateway/_match", expect.objectContaining({ credentials: "include", method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).patientUuid).toBe("existing-uuid");
    vi.unstubAllGlobals();
  });
  it("never interprets a failed matching request as no candidates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(matchLocalIdentity(identityFromForm(values, types, map))).rejects.toThrow("No se pudo verificar");
    vi.unstubAllGlobals();
  });
  it("recognizes an older gateway explicitly, but does not hide authorization failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    await expect(getIdentityCapabilities()).resolves.toEqual({ enabled: false, identifierMap: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getIdentityCapabilities()).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
