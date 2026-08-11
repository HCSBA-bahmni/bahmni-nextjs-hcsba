import { describe, expect, it } from "vitest";
import { mapAllergyIntolerances } from "./allergyRecords";

describe("FHIR allergy dashboard mapping", () => {
  it("preserves allergen, reactions, severity, comment, recorder and FHIR metadata", () => {
    const records = mapAllergyIntolerances([{
      id: "allergy-1",
      type: "allergy",
      category: ["food"],
      criticality: "unable-to-assess",
      clinicalStatus: { coding: [{ code: "active" }] },
      code: { coding: [{ display: "Chocolate fallback" }] },
      recordedDate: "2026-08-04T11:22:00-04:00",
      recorder: { display: "Super Man" },
      note: [{ text: "Reacción observada durante la mañana." }],
      reaction: [{
        substance: { coding: [{ display: "Chocolate" }] },
        manifestation: [{ coding: [{ display: "Estado mental alterado" }] }, { coding: [{ display: "Anemia" }] }],
        severity: "moderate",
      }],
    }]);
    expect(records[0]).toEqual({
      id: "allergy-1",
      allergen: "Chocolate",
      reactions: ["Estado mental alterado", "Anemia"],
      severity: "moderate",
      comment: "Reacción observada durante la mañana.",
      provider: "Super Man",
      recordedDate: "2026-08-04T11:22:00-04:00",
      clinicalStatus: "active",
      criticality: "unable-to-assess",
      category: ["food"],
      type: "allergy",
    });
  });

  it("uses the severity-first and newest-first ordering from legacy", () => {
    const resource = (id: string, severity: string, recordedDate: string) => ({ id, recordedDate, reaction: [{ substance: { text: id }, severity, manifestation: [] }] });
    const records = mapAllergyIntolerances([
      resource("mild", "mild", "2026-08-04T12:00:00Z"),
      resource("severe-old", "severe", "2026-08-01T12:00:00Z"),
      resource("moderate", "moderate", "2026-08-04T12:00:00Z"),
      resource("severe-new", "severe", "2026-08-03T12:00:00Z"),
    ]);
    expect(records.map((item) => item.id)).toEqual(["severe-new", "severe-old", "moderate", "mild"]);
  });
});
