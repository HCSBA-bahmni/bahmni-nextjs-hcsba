import { describe, expect, it } from "vitest";
import { normalizeDashboardDiagnoses } from "./diagnosisRecords";

describe("legacy dashboard diagnoses", () => {
  it("keeps the configured fields and sorts primary diagnoses first", () => {
    const result = normalizeDashboardDiagnoses([
      { existingObs: "secondary", codedAnswer: { name: "Asma" }, order: "SECONDARY" },
      { existingObs: "primary", freeTextAnswer: "Hipertensión", certainty: "CONFIRMED", order: "PRIMARY", comments: "Controlar", providers: [{ name: "Dra. Uno" }] },
    ]);
    expect(result.map((item) => item.key)).toEqual(["primary", "secondary"]);
    expect(result[0]).toMatchObject({ name: "Hipertensión", certainty: "CONFIRMED", comments: "Controlar", provider: "Dra. Uno" });
  });

  it("recognizes and optionally hides the same ruled-out status as legacy", () => {
    const source = [{ codedAnswer: { name: "Influenza" }, diagnosisStatusConcept: { name: "Ruled Out Diagnosis" } }];
    expect(normalizeDashboardDiagnoses(source)[0]?.ruledOut).toBe(true);
    expect(normalizeDashboardDiagnoses(source, false)).toEqual([]);
  });
});
