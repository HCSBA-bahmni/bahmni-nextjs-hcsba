import { afterEach, describe, expect, it, vi } from "vitest";
import type { Form2Observation } from "@/features/forms/form2";
import { buildRegistrationEncounterPayload, getPatientVisits, getVisitDetails, getVisitSummary, toEncounterWireObservations } from "./visits";

afterEach(() => vi.unstubAllGlobals());

describe("visit details contract", () => {
  it("requests the encounter provider metadata used by the legacy visit header", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { void input; return new Response(JSON.stringify({ uuid: "visit/1", startDatetime: "2026-03-31T10:00:00Z", encounters: [] }), { status: 200, headers: { "content-type": "application/json" } }); });
    vi.stubGlobal("fetch", fetchMock);
    await getVisitDetails("visit/1");
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/openmrs/ws/rest/v1/visit/visit%2F1?");
    expect(decodeURIComponent(url)).toContain("provider:(uuid,display)");
  });

  it("accepts the numeric date representation returned by older inactive visits", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ uuid: "old-visit", startDatetime: 1444129200000, stopDatetime: 1458882000000 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const [oldVisit] = await getPatientVisits("patient", true);
    expect(oldVisit?.startDatetime).toBe("2015-10-06T11:00:00.000Z");
    expect(oldVisit?.stopDatetime).toBe("2016-03-25T05:00:00.000Z");
  });

  it("does not reject a legacy summary whose admission dates are numeric", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ visitType: "IPD", startDateTime: 1444129200000, stopDateTime: 1458882000000 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitSummary("old-visit")).resolves.toMatchObject({ visitType: "IPD", startDateTime: 1444129200000 });
  });
});

describe("toEncounterWireObservations", () => {
  it("matches the minimal recursive concept contract sent by Angular", () => {
    const observations: Form2Observation[] = [{
      concept: { uuid: "blood-pressure", name: "Blood Pressure", dataType: "N/A" },
      formNamespace: "Bahmni",
      formFieldPath: "Registration Details.1/24-0",
      groupMembers: [{
        concept: { uuid: "systolic", name: "Systolic", dataType: "Numeric" },
        value: 120,
        groupMembers: [],
        formNamespace: "Bahmni",
        formFieldPath: "Registration Details.1/25-0",
        voided: false,
        inactive: false,
      }],
      voided: false,
      inactive: false,
    }];

    expect(toEncounterWireObservations(observations)).toEqual([{
      concept: { uuid: "blood-pressure", name: "Blood Pressure" },
      formNamespace: "Bahmni",
      formFieldPath: "Registration Details.1/24-0",
      groupMembers: [{
        concept: { uuid: "systolic", name: "Systolic" },
        value: 120,
        groupMembers: [],
        formNamespace: "Bahmni",
        formFieldPath: "Registration Details.1/25-0",
        voided: false,
        inactive: false,
      }],
      voided: false,
      inactive: false,
    }]);
  });

  it("sends the active visit type required by the HCSBA encounter backend", () => {
    expect(buildRegistrationEncounterPayload({
      patientUuid: "patient",
      locationUuid: "location",
      encounterTypeUuid: "REG",
      visitTypeUuid: "OPD",
      providerUuid: "provider",
    })).toMatchObject({
      patientUuid: "patient",
      locationUuid: "location",
      encounterTypeUuid: "REG",
      visitTypeUuid: "OPD",
      providers: [{ uuid: "provider" }],
      observations: [],
    });
  });
});
