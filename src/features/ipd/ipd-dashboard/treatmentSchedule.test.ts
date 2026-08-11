import { describe, expect, it } from "vitest";
import type { DrugOrderRow } from "@/features/clinical/drugOrders";
import { buildMedicationSchedulePayload, createTreatmentScheduleDraft, resolveTreatmentScheduleAction, type TreatmentScheduleConfig } from "./treatmentSchedule";

const config: TreatmentScheduleConfig = {
  enable24HourTimers: true,
  drugChartStartTimeFrequencies: ["Every 8 hours"],
  drugChartScheduleFrequencies: [{ name: "Twice a day", frequencyPerDay: 2, scheduleTiming: ["06:00", "18:00"] }],
  timeInMinutesToDisableSlotPostScheduledTime: 60,
};

function order(overrides: Partial<DrugOrderRow> = {}): DrugOrderRow {
  return {
    uuid: "order-1", name: "Paracetamol 500 mg", dose: "1 Comprimido", quantity: "20 Comprimido", route: "Oral",
    frequency: "Twice a day", drugForm: "", duration: "20 Days", durationCount: 20,
    startDate: new Date(2026, 7, 4, 12).getTime(), scheduledDate: new Date(2026, 7, 4, 12).getTime(),
    instructions: "As directed", additionalInstructions: "", provider: "Super Man", providerUuid: "provider-1",
    active: true, status: "", stopReason: "", asNeeded: false, immediately: false, emergency: false,
    medicationAdministrationStarted: false, orderNumber: 1, raw: { uuid: "order-1" },
    ...overrides,
  };
}

describe("legacy IPD treatment actions", () => {
  it("shows Add to Drug Chart only with privilege and an eligible admission", () => {
    const options = { hasPrivilege: true, readOnly: false, admitted: true, now: new Date(2026, 7, 11).getTime() };
    expect(resolveTreatmentScheduleAction(order(), options)).toMatchObject({ kind: "add", label: "Programar", disabled: false });
    expect(resolveTreatmentScheduleAction(order({ stopDate: null }), options)).toMatchObject({ kind: "add", disabled: false });
    expect(resolveTreatmentScheduleAction(order(), { ...options, hasPrivilege: false })).toBeUndefined();
    expect(resolveTreatmentScheduleAction(order(), { ...options, admitted: false })).toMatchObject({ kind: "add", disabled: true });
    expect(resolveTreatmentScheduleAction(order({ startDate: new Date(2026, 7, 12).getTime() }), options)).toMatchObject({ kind: "add", disabled: true });
  });

  it("switches from edit to stop after medication administration starts", () => {
    const options = { hasPrivilege: true, readOnly: false, admitted: true };
    expect(resolveTreatmentScheduleAction(order({ schedule: { slotStartTime: undefined, firstDaySlotsStartTime: [], dayWiseSlotsStartTime: [], remainingDaySlotsStartTime: [], notes: "", medicationAdministrationStarted: false, pendingSlotsAvailable: true, allSlotsAttended: false } }), options)).toMatchObject({ kind: "edit", label: "Editar" });
    expect(resolveTreatmentScheduleAction(order({ schedule: { slotStartTime: undefined, firstDaySlotsStartTime: [], dayWiseSlotsStartTime: [], remainingDaySlotsStartTime: [], notes: "", medicationAdministrationStarted: true, pendingSlotsAvailable: true, allSlotsAttended: false } }), options)).toMatchObject({ kind: "stop", label: "Detener" });
  });
});

describe("legacy medication scheduling payload", () => {
  it("uses configured fixed schedules and Unix seconds", () => {
    const item = order();
    const draft = {
      kind: "fixed" as const,
      startTime: "",
      firstDayTimes: ["", "18:00"],
      dailyTimes: ["06:00", "18:00"],
      remainingDayTimes: ["06:00"],
      missedFirstDaySlots: 1,
    };
    const payload = buildMedicationSchedulePayload({ patientUuid: "patient-1", providerUuid: "provider-1", order: item, comments: "Con alimentos", draft });
    expect(payload).toEqual({
      patientUuid: "patient-1", providerUuid: "provider-1", orderUuid: "order-1", comments: "Con alimentos",
      serviceType: "MEDICATION_REQUEST", slotStartTime: null, medicationFrequency: "FIXED_SCHEDULE_FREQUENCY",
      firstDaySlotsStartTime: [Math.floor(new Date(2026, 7, 4, 18).getTime() / 1_000)],
      dayWiseSlotsStartTime: [Math.floor(new Date(2026, 7, 5, 6).getTime() / 1_000), Math.floor(new Date(2026, 7, 5, 18).getTime() / 1_000)],
      remainingDaySlotsStartTime: [Math.floor(new Date(2026, 7, 24, 6).getTime() / 1_000)],
    });
  });

  it("restores edit times from the schedule returned by IPD", () => {
    const six = Math.floor(new Date(2026, 7, 4, 6).getTime() / 1_000);
    const eighteen = Math.floor(new Date(2026, 7, 4, 18).getTime() / 1_000);
    const draft = createTreatmentScheduleDraft(order({ schedule: { firstDaySlotsStartTime: [eighteen], dayWiseSlotsStartTime: [six, eighteen], remainingDaySlotsStartTime: [six], notes: "Nota", medicationAdministrationStarted: false, pendingSlotsAvailable: true, allSlotsAttended: false } }), config);
    expect(draft).toMatchObject({ kind: "fixed", firstDayTimes: ["", "18:00"], dailyTimes: ["06:00", "18:00"], remainingDayTimes: ["06:00"], missedFirstDaySlots: 1 });
  });

  it("preserves the PRN placeholder contract", () => {
    const item = order({ asNeeded: true });
    const draft = createTreatmentScheduleDraft(item, config);
    expect(buildMedicationSchedulePayload({ patientUuid: "patient-1", providerUuid: "provider-1", order: item, comments: "PRN", draft })).toEqual({
      patientUuid: "patient-1", providerUuid: "provider-1", orderUuid: "order-1", comments: "PRN", serviceType: "AS_NEEDED_PLACEHOLDER",
    });
  });
});
