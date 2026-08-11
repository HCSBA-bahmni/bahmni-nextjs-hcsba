import { describe, expect, it } from "vitest";
import { buildConsultationEncounterPayload, conditionHistoryContainsSavedConditions, conditionHistoryReflectsDraftChanges, createConsultationDraft, encounterReflectsDraftChanges, markConsultationSaved, normalizeConsultationConditions, normalizeDiagnosis } from "./draft";
import type { ConsultationContextValue } from "./types";

describe("consultation encounter contract", () => {
  it("drops the single empty legacy diagnosis row from the wire payload", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [
      { clientId: "empty", order: "PRIMARY", certainty: "CONFIRMED", dirty: false },
      { clientId: "unaccepted", pendingAnswer: "texto sin aceptar", order: "PRIMARY", certainty: "CONFIRMED", dirty: true },
      { clientId: "coded", codedAnswer: { uuid: "coded" }, order: "PRIMARY", certainty: "CONFIRMED", dirty: true },
    ];
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type").bahmniDiagnoses).toEqual([expect.objectContaining({ codedAnswer: { uuid: "coded" } })]);
  });

  it("separates current and previous diagnoses like DiagnosisMapper legacy", () => {
    const previous = normalizeDiagnosis({ encounterUuid: "old-encounter", existingObs: "old-obs", codedAnswer: { uuid: "coded", name: "Asma" } }, 0, "current-encounter");
    const current = normalizeDiagnosis({ encounterUuid: "current-encounter", existingObs: "current-obs", codedAnswer: { uuid: "coded", name: "Asma" } }, 1, "current-encounter");
    expect(previous).toMatchObject({ historical: true, existingObs: null, previousObs: "old-obs" });
    expect(current).toMatchObject({ historical: false, existingObs: "current-obs" });
  });

  it("normalizes the latest condition state and preserves the original active date", () => {
    const draft = createConsultationDraft({}, [], [{ conditions: [
      { uuid: "active", concept: { uuid: "asthma", name: "Asma" }, status: "ACTIVE", onSetDate: "2025-01-01" },
      { uuid: "history", concept: { uuid: "asthma", name: "Asma" }, status: "HISTORY_OF", onSetDate: "2026-01-01", previousConditionUuid: "active", creator: { display: "Synthetic Provider" } },
    ] }]);
    expect(draft.conditions[0]).toMatchObject({ uuid: "history", status: "HISTORY_OF", activeSince: "2025-01-01", creator: "Synthetic Provider" });
  });

  it("only confirms condition persistence when the legacy read-back contains the changed state", () => {
    const draft = createConsultationDraft();
    draft.conditions = [{
      clientId: "new-condition", concept: { uuid: "http://snomed.info/sct/2492009", name: "Large tonsils (finding)" },
      status: "ACTIVE", onSetDate: "2026-08-06", dirty: true,
    }];
    const saved = normalizeConsultationConditions([{ conditions: [{
      uuid: "saved-condition", concept: { uuid: "2492009", name: "Large tonsils (finding)" },
      status: "ACTIVE", onSetDate: "2026-08-06T00:00:00.000-0300", creator: { display: "Super Man" },
    }] }]);
    expect(conditionHistoryReflectsDraftChanges(saved, draft.conditions)).toBe(true);
    expect(conditionHistoryReflectsDraftChanges([], draft.conditions)).toBe(false);
  });

  it("confirms terminology conditions by the local UUID returned by OpenMRS", () => {
    const savedByOpenMrs = [{
      uuid: "saved-condition", concept: { uuid: "931e5b35-08e9-4fa4-9210-0a7557609b5e", name: "Large tonsils (finding)" },
      status: "ACTIVE", onSetDate: "2026-08-06",
    }];
    const history = [{ conditions: [{
      uuid: "saved-condition", concept: { uuid: "931e5b35-08e9-4fa4-9210-0a7557609b5e", name: "amÃ­gdalas grandes" },
      status: "ACTIVE", onSetDate: "2026-08-06T00:00:00.000-0300",
    }] }];
    expect(conditionHistoryContainsSavedConditions(history, savedByOpenMrs)).toBe(true);
    expect(conditionHistoryContainsSavedConditions(history, [{ ...savedByOpenMrs[0], uuid: "not-persisted" }])).toBe(false);
  });

  it("keeps pending condition edits after the encounter saves but condition read-back fails", () => {
    const draft = createConsultationDraft();
    draft.conditions = [{ clientId: "pending", conditionNonCoded: "cefalea", status: "ACTIVE", dirty: true }];
    const saved = markConsultationSaved(draft, { encounterUuid: "encounter" }, undefined, true);
    expect(saved.conditions).toEqual([expect.objectContaining({ clientId: "pending", conditionNonCoded: "cefalea", dirty: true })]);
    expect(saved.encounterUuid).toBe("encounter");
  });

  it("preserves the legacy top-level write contract", () => {
    const draft = createConsultationDraft();
    draft.diagnoses.push({ clientId: "d", freeTextAnswer: "cefalea", order: "PRIMARY", certainty: "CONFIRMED", dirty: true });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "without-visit", appConfig: { defaultVisitType: "OPD" }, enrollmentUuid: "enrollment" } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload).toMatchObject({ patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "encounter-type", visitType: "OPD", context: { patientProgramUuid: "enrollment" } });
    expect(payload).toHaveProperty("bahmniDiagnoses");
    expect(payload).toHaveProperty("orders");
    expect(payload).toHaveProperty("drugOrders");
    expect(payload).toHaveProperty("observations");
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen");
  });

  it("serializes medications with the legacy FlexibleDosingInstructions contract", () => {
    const draft = createConsultationDraft();
    draft.drugOrders.push({
      clientId: "rx", drug: { uuid: "drug", name: "Paracetamol", concept: { uuid: "concept" } }, dose: 500,
      doseUnits: "mg", route: "Oral", frequency: "Twice daily", duration: 5, durationUnits: "Days",
      quantity: 10, quantityUnits: "Tablet", instructions: "As directed", additionalInstructions: "With food",
      effectiveStartDate: "2026-08-05", orderSetUuid: "set", dirty: true,
    });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "without-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload.drugOrders).toEqual([expect.objectContaining({
      careSetting: "OUTPATIENT", orderType: "Drug Order",
      dosingInstructionType: "org.openmrs.module.bahmniemrapi.drugorder.dosinginstructions.FlexibleDosingInstructions",
      duration: 5, durationUnits: "Days", scheduledDate: "2026-08-05",
      dosingInstructions: expect.objectContaining({ dose: 500, asNeeded: false, quantity: 10, quantityUnits: "Tablet", numberOfRefills: 0 }),
      orderGroup: { uuid: undefined, orderSet: { uuid: "set" } },
    })]);
    expect((payload.drugOrders as Array<Record<string, unknown>>)[0]).not.toHaveProperty("effectiveStartDate");
    expect((payload.drugOrders as Array<Record<string, unknown>>)[0]).not.toHaveProperty("concept");
    const dosing = (payload.drugOrders as Array<{ dosingInstructions: { administrationInstructions: string } }>)[0]!.dosingInstructions;
    expect(JSON.parse(dosing.administrationInstructions)).toEqual({ instructions: "As directed", additionalInstructions: "With food" });
  });

  it("reconciles an ambiguous save only when the read-back contains every changed domain", () => {
    const draft = createConsultationDraft();
    draft.diagnoses.push({ clientId: "d", codedAnswer: { uuid: "diagnosis-uuid" }, order: "PRIMARY", certainty: "CONFIRMED", dirty: true });
    draft.orders.push({ clientId: "o", concept: { uuid: "order-uuid" }, dirty: true });
    expect(encounterReflectsDraftChanges({ encounterUuid: "e", bahmniDiagnoses: [{ codedAnswer: { uuid: "diagnosis-uuid" } }], orders: [{ concept: { uuid: "order-uuid" } }] }, draft)).toBe(true);
    expect(encounterReflectsDraftChanges({ encounterUuid: "e", bahmniDiagnoses: [{ codedAnswer: { uuid: "diagnosis-uuid" } }] }, draft)).toBe(false);
  });

  it("preserves and writes bacteriology concept-set groups like SpecimenMapper legacy", () => {
    const additional = { concept: { uuid: "attributes" }, groupMembers: [{ concept: { uuid: "color" }, value: "red" }] };
    const results = { concept: { uuid: "results" }, groupMembers: [{ concept: { uuid: "culture" }, value: "positive" }] };
    const draft = createConsultationDraft({ extensions: { mdrtbSpecimen: [{ uuid: "sample", dateCollected: "2026-08-04", type: { uuid: "blood", name: "Blood" }, sample: { additionalAttributes: additional }, report: { results } }] } });
    expect(draft.specimens[0]).toMatchObject({ additionalAttributes: [additional], results: [results] });
    draft.specimens[0]!.dirty = true;
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes", additional);
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results", results);
  });

  it("normalizes the epoch date returned by Bacteriology before editing or voiding", () => {
    const draft = createConsultationDraft({ extensions: { mdrtbSpecimen: [{ uuid: "sample", existingObs: "sample-obs", dateCollected: 1785974400000, type: { uuid: "urine", name: "Urine" } }] } });
    expect(draft.specimens[0]).toMatchObject({ dateCollected: "2026-08-06", uuid: "sample" });
    Object.assign(draft.specimens[0]!, { voided: true, dirty: true });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type")).toHaveProperty("extensions.mdrtbSpecimen.0", expect.objectContaining({ dateCollected: "2026-08-06", existingObs: "sample-obs", voided: true }));
  });

  it("voids an existing specimen and its persisted observation tree like ObservationFilter legacy", () => {
    const additional = { uuid: "attributes-obs", concept: { uuid: "attributes", conceptClass: { name: "Bacteriology Attributes" } }, value: "summary", groupMembers: [{ uuid: "note-obs", concept: { uuid: "note", conceptClass: { name: "Misc" } }, value: "previous note", groupMembers: [] }] };
    const results = { uuid: "results-obs", concept: { uuid: "results", conceptClass: { name: "Bacteriology Results" } }, value: "positive", groupMembers: [{ uuid: "result-obs", concept: { uuid: "culture", conceptClass: { name: "Misc" } }, value: { uuid: "positive", name: "Positive", conceptClass: { name: "Misc" } }, groupMembers: [] }] };
    const draft = createConsultationDraft({ extensions: { mdrtbSpecimen: [{ uuid: "sample", dateCollected: "2026-08-04", type: { uuid: "blood", name: "Blood" }, sample: { additionalAttributes: additional }, report: { results } }] } });
    Object.assign(draft.specimens[0]!, { voided: true, dirty: true });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = JSON.parse(JSON.stringify(buildConsultationEncounterPayload(draft, context, "encounter-type")));
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.voided", true);
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes.voided", true);
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes.groupMembers.0.voided", true);
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.voided", true);
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.groupMembers.0.voided", true);
    expect(payload.extensions.mdrtbSpecimen[0].sample.additionalAttributes).not.toHaveProperty("value");
    expect(payload.extensions.mdrtbSpecimen[0].report.results.groupMembers[0]).not.toHaveProperty("value");
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.type", { uuid: "blood", name: "Blood" });
  });

  it("does not confirm an ambiguous specimen void while the read-back still contains it active", () => {
    const encounter = { encounterUuid: "encounter", extensions: { mdrtbSpecimen: [{ uuid: "sample", type: { uuid: "urine", name: "Urine" } }] } };
    const draft = createConsultationDraft(encounter);
    Object.assign(draft.specimens[0]!, { voided: true, dirty: true });
    expect(encounterReflectsDraftChanges(encounter, draft)).toBe(false);
    expect(encounterReflectsDraftChanges({ encounterUuid: "encounter", extensions: { mdrtbSpecimen: [] } }, draft)).toBe(true);
    expect(encounterReflectsDraftChanges({ encounterUuid: "encounter", extensions: { mdrtbSpecimen: [{ uuid: "sample", voided: true }] } }, draft)).toBe(true);
  });

  it("flattens bacteriology REST concept metadata before writing the legacy contract", () => {
    const draft = createConsultationDraft();
    draft.specimens.push({
      clientId: "specimen", dateCollected: "2026-08-05", type: { uuid: "blood", name: "Blood", conceptClass: { name: "Specimen" } }, dirty: true,
      results: [{
        concept: { uuid: "results", name: { name: "Bacteriology Results" }, conceptClass: { name: "Bacteriology Results" }, setMembers: [{ uuid: "smear" }] },
        groupMembers: [{ concept: { uuid: "smear", name: { name: "Smear result" }, conceptClass: { name: "Misc" } }, value: { uuid: "scanty", name: { name: "Scanty 1-3" }, conceptClass: { name: "Misc" } }, groupMembers: [] }],
      }],
    });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.type", { uuid: "blood", name: "Blood" });
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.concept", { uuid: "results", name: "Bacteriology Results" });
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.groupMembers.0.concept", { uuid: "smear", name: "Smear result" });
    expect(payload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.groupMembers.0.value", { uuid: "scanty", name: "Scanty 1-3" });
  });

  it("omits the empty bacteriology editor that legacy creates automatically", () => {
    const draft = createConsultationDraft();
    draft.specimens.push({ clientId: "blank", dirty: false });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type")).toHaveProperty("extensions.mdrtbSpecimen", []);
  });

  it("ports legacy follow-up conditions into encounter observations", () => {
    const draft = createConsultationDraft();
    draft.followUpConditionConcept = { uuid: "follow-up-concept" };
    draft.followUpConditions.push({ concept: { uuid: "follow-up-concept" }, value: "condition-uuid", voided: false });
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", visit: { uuid: "visit" }, appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload.observations).toContainEqual({ concept: { uuid: "follow-up-concept" }, value: "condition-uuid", voided: false });
  });

  it("filters discontinued and superseded orders like ConsultationMapper legacy", () => {
    const draft = createConsultationDraft({
      orders: [
        { uuid: "active-order", concept: { uuid: "test" } },
        { uuid: "stopped-order", concept: { uuid: "stopped" }, dateStopped: "2026-08-01" },
        { uuid: "voided-order", concept: { uuid: "voided" }, voided: true },
      ],
      drugOrders: [
        { uuid: "original-drug", drug: { uuid: "drug" } },
        { uuid: "revised-drug", drug: { uuid: "drug" }, action: "REVISE", previousOrderUuid: "original-drug" },
        { uuid: "discontinued-drug", drug: { uuid: "other" }, action: "DISCONTINUE" },
      ],
    });
    expect(draft.orders.map((order) => order.uuid)).toEqual(["active-order"]);
    expect(draft.drugOrders.map((order) => order.uuid)).toEqual(["revised-drug"]);
  });

  it("updates the existing special note observation instead of creating a duplicate", () => {
    const draft = createConsultationDraft();
    draft.consultationNote = "Nota editada";
    draft.consultationNoteConcept = { uuid: "note-concept", name: "Consultation Note" };
    draft.consultationNoteObservation = { uuid: "note-observation", concept: { uuid: "note-concept" }, value: "Nota anterior" };
    const context = { patientUuid: "patient", location: { uuid: "location" }, provider: { uuid: "provider", attributes: [] }, mode: "active-visit", visit: { uuid: "visit" }, appConfig: { defaultVisitType: "OPD" } } as unknown as ConsultationContextValue;
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload.observations).toContainEqual(expect.objectContaining({ uuid: "note-observation", value: "Nota editada", concept: { uuid: "note-concept", name: "Consultation Note" } }));
  });
});
