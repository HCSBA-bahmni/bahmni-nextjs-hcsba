import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFormEncounterUpdate, getBahmniEncounter, getLatestPublishedForms, getPatientFormSummaries } from "./forms";

afterEach(() => vi.unstubAllGlobals());

describe("Form 2 microfrontend contracts", () => {
  it("loads patient forms using the exact React 16 MFE endpoint", async () => {
    const legacyTimestamp = 1693277657000;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      formType: "v2",
      formName: "Vitals",
      formVersion: 1,
      visitUuid: "visit",
      visitStartDateTime: 1693277349000,
      encounterUuid: "encounter",
      encounterDateTime: legacyTimestamp,
      providers: [{ providerName: "Doctor One", uuid: "provider" }],
    }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const forms = await getPatientFormSummaries("patient", 10);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/bahmnicore/patient/patient/forms");
    expect(Object.fromEntries(url.searchParams)).toEqual({ formType: "v2", numberOfVisits: "10" });
    expect(forms[0]).toMatchObject({ encounterDateTime: legacyTimestamp, visitStartDateTime: 1693277349000 });
  });

  it("loads published form metadata and encounter details from legacy contracts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ uuid: "form", name: "Vitals" }]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ observations: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getLatestPublishedForms();
    await getBahmniEncounter("encounter");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmniie/form/latestPublishedForms");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/encounter?includeAll=false");
  });

  it("replaces only the edited form observations and preserves the encounter context", () => {
    const payload = buildFormEncounterUpdate({
      patientUuid: "patient", encounterUuid: "encounter", visitUuid: "visit", locationUuid: "location",
      providers: [{ uuid: "provider" }], observations: [
        { uuid: "old-vitals", formFieldPath: "Vitals.1/1-0", value: 70 },
        { uuid: "other", formFieldPath: "History.1/2-0", value: "Stable" },
      ],
    }, "Vitals", [{ uuid: "old-vitals", formFieldPath: "Vitals.1/1-0", value: 71 }]);
    expect(payload).toMatchObject({ patientUuid: "patient", encounterUuid: "encounter", visitUuid: "visit", locationUuid: "location", orders: [], drugOrders: [], bahmniDiagnoses: [] });
    expect(payload.observations).toEqual([
      { uuid: "other", formFieldPath: "History.1/2-0", value: "Stable" },
      { uuid: "old-vitals", formFieldPath: "Vitals.1/1-0", value: 71 },
    ]);
  });
});
