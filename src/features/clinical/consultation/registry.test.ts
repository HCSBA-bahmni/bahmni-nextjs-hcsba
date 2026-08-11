import { describe, expect, it } from "vitest";
import { ConsultationBoardRegistry } from "./registry";
import { createConsultationDraft } from "./draft";
import type { ConsultationContextValue } from "./types";

const context = { mode: "active-visit" } as ConsultationContextValue;

describe("consultation board validation", () => {
  it("accepts the empty legacy placeholder row but rejects unaccepted free text", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [{ clientId: "empty", order: "PRIMARY", certainty: "CONFIRMED" }];
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toEqual({ valid: true });
    draft.diagnoses[0]!.pendingAnswer = "texto pendiente";
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("rejects duplicate diagnoses using the legacy coded identity", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [
      { clientId: "1", codedAnswer: { uuid: "same" }, order: "PRIMARY", certainty: "CONFIRMED" },
      { clientId: "2", codedAnswer: { uuid: "same" }, order: "SECONDARY", certainty: "PRESUMED" },
    ];
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("allows a diagnosis from a previous encounter to be recorded again", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [
      { clientId: "historical", codedAnswer: { uuid: "anemia", name: "Anemia" }, order: "PRIMARY", certainty: "CONFIRMED", historical: true },
      { clientId: "current", codedAnswer: { uuid: "anemia", name: "Anemia" }, order: "PRIMARY", certainty: "PRESUMED", dirty: true },
    ];
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toEqual({ valid: true });
  });

  it("still rejects a new diagnosis already saved in the current encounter", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [
      { clientId: "saved-current", codedAnswer: { uuid: "anemia", name: "Anemia" }, existingObs: "obs-current", encounterUuid: "encounter-current", order: "PRIMARY", certainty: "CONFIRMED" },
      { clientId: "new-current", codedAnswer: { uuid: "anemia", name: "Anemia" }, order: "SECONDARY", certainty: "PRESUMED", dirty: true },
    ];
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("requires concept or free text and status for each non-voided condition", () => {
    const draft = createConsultationDraft();
    draft.conditions = [{ clientId: "condition", status: "ACTIVE" }];
    expect(ConsultationBoardRegistry.diagnosis.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("does not run disabled retrospective board validators", () => {
    const draft = createConsultationDraft();
    draft.specimens = [{ clientId: "sample", dirty: true }];
    expect(ConsultationBoardRegistry.bacteriology.disabled?.({ mode: "retrospective" } as ConsultationContextValue)).toBe(true);
  });

  it("ignores a pristine blank specimen but validates a partially completed one", () => {
    const draft = createConsultationDraft();
    draft.specimens = [{ clientId: "blank", dirty: false }];
    expect(ConsultationBoardRegistry.bacteriology.validate(draft, context)).toEqual({ valid: true });
    draft.specimens[0] = { clientId: "partial", identifier: "sample-1", dirty: true };
    expect(ConsultationBoardRegistry.bacteriology.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("allows samples collected today and rejects only dates after today", () => {
    const draft = createConsultationDraft();
    const today = new Date();
    const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    draft.specimens = [{ clientId: "today", dateCollected: local(today), type: { uuid: "blood", name: "Blood" }, dirty: true }];
    expect(ConsultationBoardRegistry.bacteriology.validate(draft, context)).toEqual({ valid: true });
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    draft.specimens[0]!.dateCollected = local(tomorrow);
    expect(ConsultationBoardRegistry.bacteriology.validate(draft, context)).toMatchObject({ valid: false });
  });

  it("requires a date and reason when discontinuing a medication", () => {
    const draft = createConsultationDraft();
    draft.drugOrders = [{ clientId: "drug", drug: { uuid: "drug" }, action: "DISCONTINUE", previousOrderUuid: "old", dirty: true }];
    expect(ConsultationBoardRegistry.treatment.validate(draft, context)).toMatchObject({ valid: false });
    draft.drugOrders[0]!.dateStopped = "2026-08-04";
    draft.drugOrders[0]!.orderReasonConcept = { uuid: "completed" };
    expect(ConsultationBoardRegistry.treatment.validate(draft, context)).toEqual({ valid: true });
  });

  it("requires the same core prescription fields as the legacy add form", () => {
    const draft = createConsultationDraft();
    draft.drugOrders = [{ clientId: "drug", drug: { uuid: "drug" }, dose: 1, doseUnits: "Tablet", effectiveStartDate: "2026-08-05", dirty: true }];
    expect(ConsultationBoardRegistry.treatment.validate(draft, context)).toMatchObject({ valid: false });
    Object.assign(draft.drugOrders[0]!, { frequency: "Once daily", duration: 7, durationUnits: "Days" });
    expect(ConsultationBoardRegistry.treatment.validate(draft, context)).toEqual({ valid: true });
  });
});
