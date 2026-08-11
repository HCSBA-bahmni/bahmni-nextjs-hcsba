import { afterEach, describe, expect, it, vi } from "vitest";
import { savePatient, searchPatients, uploadPatientImage } from "./patients";
import { getVisitLocation } from "./metadata";
import { endVisit, startVisit } from "./visits";

afterEach(() => vi.unstubAllGlobals());

describe("Registration HTTP contracts", () => {
  it("uses the AngularJS patient search parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pageOfResults: [], totalCount: 0 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchPatients({ q: "Ana", customAttribute: "555", patientAttributes: ["phoneNumber", "alternatePhoneNumber"], addressFieldName: "cityVillage", address: "Santiago", page: 2, pageSize: 20, locationUuid: "loc" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/bahmni/search/patient/lucene");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "Ana", identifier: "Ana", s: "byIdOrName", customAttribute: "555", patientAttributes: "phoneNumber,alternatePhoneNumber", startIndex: "20", limit: "20", loginLocationUuid: "loc", filterOnAllIdentifiers: "true" });
    expect(url.searchParams.has("addressFieldName")).toBe(false);
    expect(url.searchParams.has("addressFieldValue")).toBe(false);
  });

  it("preserves update UUIDs and sends Jump-Accepted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ patient: { uuid: "p1" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await savePatient({ uuid: "p1", nameUuid: "n1", addressUuid: "a1", identifierUuid: "i1", givenName: "Ana", familyName: "Pérez", gender: "F", birthDate: "1990-01-01", identifier: "12-3", identifierTypeUuid: "type", attributes: {}, relationships: [] }, true);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get("Jump-Accepted")).toBe("true");
    expect(JSON.parse(String(request.body))).toMatchObject({ patient: { uuid: "p1", person: { uuid: "p1", names: [{ uuid: "n1" }], addresses: [{ uuid: "a1" }] }, identifiers: [{ uuid: "i1" }] } });
  });

  it("uploads only base64 image data to personimage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(undefined, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadPatientImage("p1", "data:image/jpeg;base64,QUJD");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/personimage/");
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ person: { uuid: "p1" }, base64EncodedImage: "QUJD" });
  });

  it("closes visits with the Bahmni query parameter contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(undefined, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await endVisit("visit-1");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/visit/endVisit?visitUuid=visit-1");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe("{}");
  });

  it("resolves the visit location from the login location like AngularJS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "visit-location" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getVisitLocation("login-location");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/visitLocation/login-location");
  });

  it("creates a visit at the mapped visit location using the legacy wire payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "visit-1", startDatetime: "2026-08-03T10:00:00.000Z" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await startVisit("patient-1", "visit-type-1", "mapped-visit-location");
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      patient: "patient-1",
      visitType: "visit-type-1",
      location: "mapped-visit-location",
    });
  });
});
