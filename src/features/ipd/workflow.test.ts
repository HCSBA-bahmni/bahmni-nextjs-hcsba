import { describe, expect, it } from "vitest";
import { buildAdtEncounterPayload } from "./workflow";

describe("ADT encounter contract", () => {
  it("matches the minimal legacy admission wire contract", () => {
    expect(buildAdtEncounterPayload({ action: "admit", patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "admission", visitTypeUuid: "ipd", providerUuid: "provider", observations: [{ concept: { uuid: "concept" }, value: "value" }] })).toEqual({
      patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "admission", visitTypeUuid: "ipd", providers: [{ uuid: "provider" }], observations: [{ concept: { uuid: "concept" }, value: "value" }],
    });
  });

  it("does not invent a visit type for discharge", () => {
    expect(buildAdtEncounterPayload({ action: "discharge", patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "discharge" })).not.toHaveProperty("visitTypeUuid");
  });
});
