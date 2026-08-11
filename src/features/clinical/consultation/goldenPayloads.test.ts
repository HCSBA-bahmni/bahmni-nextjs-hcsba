import { describe, expect, it } from "vitest";
import { buildFormObservations, form2DefinitionSchema } from "@/features/forms/form2";
import { buildConsultationConditionsPayload } from "@/services/bahmni/consultation";
import { buildConsultationEncounterPayload, createConsultationDraft } from "./draft";
import type { ConsultationContextValue } from "./types";

// Golden expectations are transcribed from:
// ui/app/clinical/consultation/mappers/encounterTransactionMapper.js
// ui/app/clinical/common/models/order.js
// ui/app/clinical/common/models/drugOrder.js
// ui/app/common/domain/services/conditionsService.js
const context = {
  patientUuid: "patient",
  location: { uuid: "location" },
  provider: { uuid: "provider", attributes: [] },
  visit: { uuid: "visit" },
  mode: "active-visit",
  enrollmentUuid: "enrollment",
  appConfig: { defaultVisitType: "OPD", visitTypeForRetrospectiveEntries: "RETRO" },
} as unknown as ConsultationContextValue;

describe("golden AngularJS/Next consultation payloads", () => {
  it("preserves Form2 namespace, field paths, groups and existing UUIDs", () => {
    const definition = form2DefinitionSchema.parse({ name: "Vitals", uuid: "form", version: "1", controls: [{
      type: "obsGroupControl", id: 10, label: "Pressure", concept: { uuid: "pressure", name: "Pressure", datatype: "N/A" }, controls: [
        { type: "obsControl", id: 11, label: "Systolic", concept: { uuid: "systolic", name: "Systolic", datatype: "Numeric" } },
      ],
    }] });
    const observations = buildFormObservations(definition, { "11": 120 }, [{ uuid: "group-obs", concept: { uuid: "pressure" }, formFieldPath: "Vitals.1/10-0", groupMembers: [{ uuid: "systolic-obs", concept: { uuid: "systolic" }, value: 110, formFieldPath: "Vitals.1/11-0", groupMembers: [] }] }]);
    const draft = createConsultationDraft();
    draft.forms.vitals = { id: "vitals", formName: "Vitals", formUuid: "form", formVersion: "1", definition, observations, valid: true, translations: {} };
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload.observations).toEqual([expect.objectContaining({
      uuid: "group-obs", concept: { uuid: "pressure", name: "Pressure" }, formNamespace: "Bahmni", formFieldPath: "Vitals.1/10-0",
      groupMembers: [expect.objectContaining({ uuid: "systolic-obs", concept: { uuid: "systolic", name: "Systolic" }, value: 120, formFieldPath: "Vitals.1/11-0" })],
    })]);
  });

  it("matches coded and non-coded diagnosis writes", () => {
    const draft = createConsultationDraft();
    draft.diagnoses = [
      { clientId: "coded", codedAnswer: { uuid: "123", conceptSystem: "SNOMED" }, order: "PRIMARY", certainty: "CONFIRMED", existingObs: null, comments: "confirmed", dirty: true },
      { clientId: "free", freeTextAnswer: "diagnóstico libre", order: "SECONDARY", certainty: "PRESUMED", existingObs: "old-obs", voided: true, dirty: true },
    ];
    const payload = buildConsultationEncounterPayload(draft, context, "encounter-type");
    expect(payload.bahmniDiagnoses).toEqual([
      { codedAnswer: { uuid: "SNOMED/123" }, freeTextAnswer: undefined, order: "PRIMARY", certainty: "CONFIRMED", existingObs: null, diagnosisDateTime: null, diagnosisStatusConcept: undefined, voided: false, comments: "confirmed" },
      { codedAnswer: { uuid: undefined }, freeTextAnswer: "diagnóstico libre", order: "SECONDARY", certainty: "PRESUMED", existingObs: "old-obs", diagnosisDateTime: null, diagnosisStatusConcept: undefined, voided: true, comments: undefined },
    ]);
  });

  it("matches condition and disposition contracts", () => {
    const conditions = buildConsultationConditionsPayload("patient", [{
      clientId: "condition", uuid: "condition-uuid", concept: { uuid: "concept" }, status: "INACTIVE", onSetDate: "2026-01-01",
      endDate: "2026-08-04", endReason: "resolved", additionalDetail: "detail", voided: false,
    }]);
    expect(conditions).toEqual([{ uuid: "condition-uuid", patientUuid: "patient", concept: { uuid: "concept" }, conditionNonCoded: undefined, status: "INACTIVE", onSetDate: "2026-01-01", endDate: "2026-08-04", endReason: "resolved", additionalDetail: "detail", voided: false, voidReason: undefined }]);

    const terminologyCondition = buildConsultationConditionsPayload("patient", [{
      clientId: "terminology-condition",
      concept: { uuid: "http://snomed.info/sct/420662003", name: "Coma diabético", conceptSystem: "http://snomed.info/sct", conceptUuid: "420662003", label: "Coma diabético" },
      status: "ACTIVE",
    }]);
    expect(terminologyCondition[0]?.concept).toEqual({ uuid: "http://snomed.info/sct/420662003", name: "Coma diabético" });

    const draft = createConsultationDraft();
    draft.disposition = { code: "DISCHARGE", conceptName: "Discharge", dispositionDateTime: "2026-08-04", additionalObs: [{ uuid: "note-obs", concept: { uuid: "note" }, value: "stable", voided: false }] };
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type").disposition).toEqual(draft.disposition);
  });

  it("matches new, revised and discontinued order writes", () => {
    const draft = createConsultationDraft();
    draft.orders = [
      { clientId: "new", concept: { uuid: "lab", name: "Lab" }, commentToFulfiller: "NeedsPrint note", isUrgent: true, dirty: true },
      { clientId: "revise", uuid: "old-radiology", concept: { uuid: "radiology", name: "Radiology" }, commentToFulfiller: "revised", action: "REVISE", dirty: true },
      { clientId: "stop", uuid: "old-procedure", concept: { uuid: "procedure", name: "Procedure" }, action: "DISCONTINUE", dirty: true },
    ];
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type").orders).toEqual([
      { uuid: undefined, concept: { uuid: "lab", name: "Lab" }, commentToFulfiller: "NeedsPrint note", urgency: "STAT" },
      { concept: { uuid: "radiology", name: "Radiology" }, commentToFulfiller: "revised", urgency: undefined, action: "REVISE", previousOrderUuid: "old-radiology" },
      { concept: { uuid: "procedure", name: "Procedure" }, commentToFulfiller: undefined, urgency: undefined, action: "DISCONTINUE", previousOrderUuid: "old-procedure" },
    ]);
  });

  it("matches mdrtbSpecimen sample and report groups", () => {
    const draft = createConsultationDraft();
    draft.specimens = [{
      clientId: "specimen", dateCollected: "2026-08-04", type: { uuid: "blood", name: "Blood" }, identifier: "synthetic",
      additionalAttributes: [{ concept: { uuid: "attributes" }, groupMembers: [{ concept: { uuid: "colour" }, value: "red" }] }],
      results: [{ concept: { uuid: "results" }, groupMembers: [{ concept: { uuid: "culture" }, value: "positive" }] }], dirty: true,
    }];
    expect(buildConsultationEncounterPayload(draft, context, "encounter-type")).toHaveProperty("extensions.mdrtbSpecimen.0", {
      dateCollected: "2026-08-04", uuid: undefined, identifier: "synthetic", type: { uuid: "blood", name: "Blood" }, voided: false, typeFreeText: undefined,
      sample: { additionalAttributes: { concept: { uuid: "attributes" }, groupMembers: [{ concept: { uuid: "colour" }, value: "red" }] } },
      report: { results: { concept: { uuid: "results" }, groupMembers: [{ concept: { uuid: "culture" }, value: "positive" }] } },
    });
  });

  it("matches FlexibleDosingInstructions for new, revised and stopped drugs", () => {
    const draft = createConsultationDraft();
    draft.drugOrders = [{
      clientId: "drug", drug: { uuid: "drug", name: "Synthetic drug", concept: { uuid: "drug-concept", name: { name: "Synthetic concept", locale: "en" } } }, dose: 1, doseUnits: "Tablet", route: "Oral",
      frequency: "Once daily", duration: 7, durationUnits: "Days", quantity: 7, instructions: "After food", additionalInstructions: "Water",
      asNeeded: false, effectiveStartDate: "2026-08-04", orderSetUuid: "set", dirty: true,
    }, {
      clientId: "stopped", drug: { uuid: "old-drug", name: "Old drug", concept: { uuid: "old-concept" } }, action: "DISCONTINUE", previousOrderUuid: "old-order",
      dateStopped: "2026-08-04", orderReasonConcept: { uuid: "reason" }, orderReasonNonCoded: "resolved", dirty: true,
    }];
    const drugs = buildConsultationEncounterPayload(draft, context, "encounter-type").drugOrders as Array<Record<string, unknown>>;
    expect(drugs[0]).toMatchObject({ careSetting: "OUTPATIENT", orderType: "Drug Order", drug: { uuid: "drug", name: "Synthetic drug" }, duration: 7, durationUnits: "Days", scheduledDate: "2026-08-04", orderGroup: { uuid: undefined, orderSet: { uuid: "set" } } });
    expect(drugs[0]).not.toHaveProperty("effectiveStartDate");
    expect(drugs[0]).not.toHaveProperty("concept");
    expect(drugs[0]?.dosingInstructions).toEqual({ dose: 1, doseUnits: "Tablet", route: "Oral", frequency: "Once daily", asNeeded: false, administrationInstructions: JSON.stringify({ instructions: "After food", additionalInstructions: "Water" }), quantity: 7, quantityUnits: "Unit(s)", numberOfRefills: 0 });
    expect(drugs[1]).toMatchObject({ action: "DISCONTINUE", previousOrderUuid: "old-order", dateStopped: "2026-08-04", orderReasonConcept: { uuid: "reason" }, orderReasonText: "resolved" });
  });
});
