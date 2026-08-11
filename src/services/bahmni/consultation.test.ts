import { afterEach, describe, expect, it, vi } from "vitest";
import { findActiveConsultationEncounter, findConsultationEncounter, normalizeDiagnosisConceptSuggestions } from "./consultation";

afterEach(() => vi.restoreAllMocks());

describe("normalizeDiagnosisConceptSuggestions", () => {
  it("maps the terminology response to visible and selectable autocomplete entries", () => {
    expect(normalizeDiagnosisConceptSuggestions([
      {
        conceptName: "coma debido a diabetes mellitus",
        conceptUuid: "420662003",
        matchedName: "coma diabético",
        conceptSystem: "http://snomed.info/sct",
        code: "E13.11",
      },
    ])).toEqual([
      expect.objectContaining({
        uuid: "420662003",
        conceptUuid: "420662003",
        name: "coma diabético",
        matchedName: "coma diabético",
        conceptName: "coma debido a diabetes mellitus",
        conceptSystem: "http://snomed.info/sct",
        label: "coma diabético → coma debido a diabetes mellitus (E13.11)",
      }),
    ]);
  });

  it("discards malformed results that cannot be selected", () => {
    expect(normalizeDiagnosisConceptSuggestions([
      { conceptName: "sin identificador" },
      { conceptUuid: "without-name" },
    ])).toEqual([]);
  });
});

describe("active consultation encounter resolution", () => {
  it("keeps the exact legacy find contract without an ineffective visitUuids filter", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));

    await findConsultationEncounter({
      patientUuid: "patient",
      providerUuid: "provider",
      encounterTypeUuid: "consultation-type",
      locationUuid: "location",
    });

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      patientUuid: "patient",
      providerUuids: ["provider"],
      includeAll: true,
      encounterTypeUuids: ["consultation-type"],
      locationUuid: "location",
    });
  });

  it("loads the newest existing Consultation encounter from the active visit", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { uuid: "older", encounterDatetime: "2026-08-06T08:00:00.000-0400", visit: { uuid: "visit" } },
        { uuid: "other-visit", encounterDatetime: "2026-08-06T12:00:00.000-0400", visit: { uuid: "other" } },
        { uuid: "newest", encounterDatetime: "2026-08-06T10:00:00.000-0400", visit: { uuid: "visit" } },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encounterUuid: "newest", observations: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(findActiveConsultationEncounter({
      patientUuid: "patient",
      providerUuid: "provider",
      encounterTypeUuid: "consultation-type",
      locationUuid: "location",
      visitUuid: "visit",
    })).resolves.toMatchObject({ encounterUuid: "newest" });

    expect(String(request.mock.calls[1]?.[0])).toContain("/bahmnicore/bahmniencounter/newest");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
