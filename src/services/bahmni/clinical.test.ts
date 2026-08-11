import { afterEach, describe, expect, it, vi } from "vitest";
import { getClinicalQueuePatients, getPatientDiagnoses, getPatientObservations, searchAllClinicalPatients } from "./clinical";

afterEach(() => vi.unstubAllGlobals());

describe("clinical read contracts", () => {
  it("uses the legacy diagnosis endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getPatientDiagnoses("patient", "visit");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/diagnosis/search?patientUuid=patient&visitUuid=visit");
  });

  it("repeats configured concept parameters like AngularJS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getPatientObservations({ patientUuid: "patient", conceptNames: ["Height (cm)", "Weight (kg)"], numberOfVisits: 2 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.searchParams.getAll("concept")).toEqual(["Height (cm)", "Weight (kg)"]);
    expect(url.searchParams.get("patientUuid")).toBe("patient");
    expect(url.searchParams.get("numberOfVisits")).toBe("2");
  });

  it("loads configured clinical queues from bahmnicore sql with legacy parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ uuid: "p1", identifier: "RUN*1", name: "Ana Pérez", activeVisitUuid: "v1" }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const patients = await getClinicalQueuePatients({ handler: "emrapi.sqlSearch.activePatients", locationUuid: "location", providerUuid: "provider" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/bahmnicore/sql");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "emrapi.sqlSearch.activePatients", v: "full", location_uuid: "location", provider_uuid: "provider" });
    expect(patients[0]).toMatchObject({ uuid: "p1", identifier: "RUN*1", activeVisitUuid: "v1" });
  });

  it("uses the distinct legacy Lucene contract for the All tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pageOfResults: [{ uuid: "p1", identifier: "RUN*1", name: "Ana Pérez" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchAllClinicalPatients({ query: "Ana", locationUuid: "location", filterOutAttribute: { attrName: "archive", attrValue: "true" } });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/bahmni/search/patient/lucene");
    expect(Object.fromEntries(url.searchParams)).toEqual({ filterOnAllIdentifiers: "true", q: "Ana", startIndex: "0", identifier: "Ana", loginLocationUuid: "location", attributeToFilterOut: "archive", attributeValueToFilterOut: "true" });
    expect(url.searchParams.has("s")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
  });
});
