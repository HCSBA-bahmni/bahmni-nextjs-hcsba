import { describe, expect, it } from "vitest";
import { createConsultationDraft } from "./draft";
import { consultationPadDiagnoses, consultationPadHasContent, consultationPadObservations } from "./summaryPad";

const diagnosis = (name: string, encounterUuid: string) => ({
  codedAnswer: { uuid: name.toLowerCase(), name },
  encounterUuid,
  order: "PRIMARY",
  certainty: "CONFIRMED",
});

describe("consultation summary pad parity", () => {
  it("does not expose longitudinal diagnoses or conditions in an empty current encounter", () => {
    const diagnoses = Array.from({ length: 23 }, (_, index) => diagnosis(`Histórico ${index}`, `old-${index}`));
    const conditions = Array.from({ length: 7 }, (_, index) => ({
      uuid: `condition-${index}`,
      concept: { uuid: `concept-${index}`, name: `Condición ${index}` },
      status: "ACTIVE",
    }));
    const draft = createConsultationDraft({ uuid: "current" }, diagnoses, conditions);

    expect(consultationPadDiagnoses(draft)).toEqual([]);
    expect(consultationPadObservations(draft)).toEqual([]);
    expect(consultationPadHasContent(draft)).toBe(false);
  });

  it("includes diagnoses from this encounter and past diagnoses edited now", () => {
    const draft = createConsultationDraft(
      { uuid: "current" },
      [diagnosis("Actual", "current"), diagnosis("Histórico", "old")],
    );
    draft.diagnoses[1]!.dirty = true;

    expect(consultationPadDiagnoses(draft).map((item) => item.codedAnswer?.name)).toEqual(["Actual", "Histórico"]);
    expect(consultationPadHasContent(draft)).toBe(true);
  });

  it("includes current observations but excludes consultation infrastructure observations", () => {
    const draft = createConsultationDraft({
      uuid: "current",
      observations: [
        { uuid: "weight-obs", concept: { uuid: "weight", name: "Peso" }, value: 72 },
        { uuid: "note-obs", concept: { uuid: "note", name: "Nota" }, value: "texto" },
        { uuid: "dispensed-obs", concept: { uuid: "dispensed", name: "Dispensed" }, value: true },
      ],
    });
    draft.consultationNoteConcept = { uuid: "note" };

    expect(consultationPadObservations(draft).map((item) => item.label)).toEqual(["Peso"]);
  });

  it("does not consider discontinued treatment content", () => {
    const draft = createConsultationDraft();
    draft.drugOrders = [{ clientId: "drug-1", drugName: "Amoxicilina", action: "DISCONTINUE" }];

    expect(consultationPadHasContent(draft)).toBe(false);
  });
});
