import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSaveAllergyPayload, getAllergyCatalogs, savePatientAllergy } from "./allergies";
import { filterAllergens } from "@/features/clinical/allergies/AllergyHeaderAction";

afterEach(() => vi.unstubAllGlobals());

const concept = (members: unknown[] = [], answers: unknown[] = []) => ({ setMembers: members, answers });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("legacy allergy contract", () => {
  it("loads all five configured concept sets and preserves legacy transformations", async () => {
    const responses: Record<string, unknown> = {
      medication: concept([{ uuid: "drug", display: "Penicilina" }, { uuid: "other", display: "Other non-coded" }]),
      food: concept([{ uuid: "food", display: "Maní" }]),
      environment: concept([{ uuid: "environment", display: "Polen" }]),
      reaction: concept([{ uuid: "reaction", display: "Roncha", names: [{ display: "Urticaria" }] }, { uuid: "other-reaction", display: "Other non-coded" }]),
      severity: concept([], [{ uuid: "severe", display: "Severa" }]),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://hcsba.local");
      const uuid = url.pathname.split("/").at(-1)!;
      expect(url.searchParams.get("v")).toBe("full");
      expect(url.searchParams.get("locale")).toBe("es-CL");
      return json(responses[uuid]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const catalogs = await getAllergyCatalogs({
      medicationAllergenUuid: "medication",
      foodAllergenUuid: "food",
      environmentalAllergenUuid: "environment",
      allergyReactionUuid: "reaction",
      allergySeverityUuid: "severity",
    }, "es-CL");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(catalogs.allergens).toEqual([
      { uuid: "drug", name: "Penicilina", kind: "Drug" },
      { uuid: "environment", name: "Polen", kind: "Environment" },
      { uuid: "food", name: "Maní", kind: "Food" },
    ]);
    expect(catalogs.reactions).toEqual([{ uuid: "reaction", name: "Urticaria" }]);
    expect(catalogs.severities).toEqual([{ uuid: "severe", name: "Severa" }]);
  });

  it("sends the exact OpenMRS allergy payload used by the legacy microfrontend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ uuid: "saved" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      allergen: { uuid: "peanut", name: "Maní", kind: "Food" as const },
      reactionUuids: ["rash", "anaphylaxis"],
      severityUuid: "severe",
      comment: "Inicio 2026",
    };
    expect(buildSaveAllergyPayload(input)).toEqual({
      allergen: { allergenType: "FOOD", codedAllergen: { uuid: "peanut" } },
      reactions: [{ reaction: { uuid: "rash" } }, { reaction: { uuid: "anaphylaxis" } }],
      severity: { uuid: "severe" },
      comment: "Inicio 2026",
    });
    await savePatientAllergy("patient-uuid", input);
    expect(fetchMock).toHaveBeenCalledWith("/openmrs/ws/rest/v1/patient/patient-uuid/allergy", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(buildSaveAllergyPayload(input)),
    }));
  });

  it("prioritizes prefix matches before contains matches like legacy search", () => {
    const result = filterAllergens([
      { uuid: "1", name: "Almendra", kind: "Food" },
      { uuid: "2", name: "Polen ambiental", kind: "Environment" },
      { uuid: "3", name: "Penicilina", kind: "Drug" },
    ], "al");
    expect(result.map((item) => item.uuid)).toEqual(["1", "2"]);
  });
});
