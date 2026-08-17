import { describe, expect, it } from "vitest";
import { buildAdtEncounterPayload, resolveIpdVisit } from "./workflow";

describe("ADT encounter contract", () => {
  it("matches the minimal legacy admission wire contract", () => {
    expect(buildAdtEncounterPayload({ action: "admit", patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "admission", visitTypeUuid: "ipd", providerUuid: "provider", observations: [{ concept: { uuid: "concept" }, value: "value" }] })).toEqual({
      patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "admission", visitTypeUuid: "ipd", providers: [{ uuid: "provider" }], observations: [{ concept: { uuid: "concept" }, value: "value" }],
    });
  });

  it("does not invent a visit type for discharge", () => {
    expect(buildAdtEncounterPayload({ action: "discharge", patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "discharge" })).not.toHaveProperty("visitTypeUuid");
  });

  it("keeps the exact visit selected for an existing hospitalization", () => {
    expect(buildAdtEncounterPayload({ action: "transfer", patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "transfer", visitUuid: "ipd-visit" })).toMatchObject({ visitUuid: "ipd-visit" });
  });
});

describe("IPD visit integrity", () => {
  const visit = (uuid: string, type: string) => ({ uuid, startDatetime: "2026-08-13T08:00:00.000Z", visitType: { uuid: `${type}-uuid`, name: type } });

  it("selects the active IPD visit instead of an unrelated active OPD visit", () => {
    expect(resolveIpdVisit([visit("ipd", "IPD"), visit("opd", "OPD")], "IPD", true).visit?.uuid).toBe("ipd");
  });

  it("marks a bed without an active IPD visit as orphaned", () => {
    expect(resolveIpdVisit([], "IPD", true)).toMatchObject({ orphanedBed: true });
  });

  it("blocks an admission when multiple active visits make conversion ambiguous", () => {
    expect(resolveIpdVisit([visit("one", "OPD"), visit("two", "OPD")], "IPD", false).issue).toContain("más de una visita activa");
  });
});
