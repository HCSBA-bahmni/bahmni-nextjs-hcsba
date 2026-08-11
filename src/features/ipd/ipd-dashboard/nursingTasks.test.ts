import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { CareTask } from "@/features/ipd/care-view/types";
import {
  buildMedicationAdministration,
  buildNonMedicationUpdate,
  canNavigateToNextIpdShift,
  canAddNursingTask,
  isPrnMedication,
  matchesNursingTaskFilter,
  medicationCompletionNeedsNotes,
  nursingTaskFutureLimit,
  adjacentIpdShift,
  shiftForScheduledTask,
  taskRequiredPrivilege,
} from "./nursingTasks";
import { currentIpdShift } from "./domain";

function task(overrides: Partial<CareTask> = {}): CareTask {
  return {
    uuid: "slot-1",
    patientUuid: "patient-1",
    kind: "medication",
    name: "Paracetamol",
    status: "pending",
    rawStatus: "SCHEDULED",
    scheduledTime: Date.parse("2026-08-10T10:00:00Z"),
    extensions: { order: { uuid: "order-1", asNeeded: false } },
    ...overrides,
  };
}

describe("Nursing task privileges and filters", () => {
  it("shows Add Task under the same two privileges used by legacy", () => {
    expect(canAddNursingTask({ readOnly: false, currentShift: true, canAddNonMedication: true, canAddAdhocMedication: false })).toBe(true);
    expect(canAddNursingTask({ readOnly: false, currentShift: true, canAddNonMedication: false, canAddAdhocMedication: true })).toBe(true);
    expect(canAddNursingTask({ readOnly: false, currentShift: true, canAddNonMedication: false, canAddAdhocMedication: false })).toBe(false);
    expect(canAddNursingTask({ readOnly: true, currentShift: true, canAddNonMedication: true, canAddAdhocMedication: true })).toBe(false);
    expect(canAddNursingTask({ readOnly: false, currentShift: false, canAddNonMedication: true, canAddAdhocMedication: true })).toBe(false);
  });

  it("uses the exact legacy privilege for each task kind", () => {
    expect(taskRequiredPrivilege(task())).toBe("Edit Medication Administration");
    expect(taskRequiredPrivilege(task({ extensions: { order: { uuid: "order-1", asNeeded: true } } }))).toBe("Edit adhoc medication tasks");
    expect(taskRequiredPrivilege(task({ kind: "non-medication" }))).toBe("Edit Tasks");
    expect(isPrnMedication(task({ extensions: { order: { asNeeded: true } } }))).toBe(true);
  });

  it("keeps omitted and missed filters semantically distinct", () => {
    expect(matchesNursingTaskFilter(task({ status: "missed", rawStatus: "NOT-DONE" }), "skipped")).toBe(true);
    expect(matchesNursingTaskFilter(task({ status: "missed", rawStatus: "MISSED" }), "missed")).toBe(true);
    expect(matchesNursingTaskFilter(task({ status: "late", rawStatus: "REQUESTED" }), "pending")).toBe(true);
  });
});

describe("Nursing task shift navigation", () => {
  const shifts = {
    "1": { shiftStartTime: "08:00", shiftEndTime: "19:00" },
    "2": { shiftStartTime: "19:00", shiftEndTime: "08:00" },
  };

  it("keeps the legacy two-day future navigation horizon", () => {
    const liveShift = currentIpdShift(shifts, DateTime.fromISO("2026-08-11T07:30:00"));
    expect(nursingTaskFutureLimit(liveShift).toISO()).toBe(liveShift.start.plus({ days: 2 }).toISO());
    expect(canNavigateToNextIpdShift(liveShift, liveShift)).toBe(true);

    let future = liveShift;
    while (canNavigateToNextIpdShift(future, liveShift)) {
      future = adjacentIpdShift(shifts, future, 1);
    }
    expect(future.end.toMillis()).toBeGreaterThanOrEqual(nursingTaskFutureLimit(liveShift).toMillis());
    expect(canNavigateToNextIpdShift(future, liveShift)).toBe(false);
  });

  it("resolves the configured shift that contains a newly scheduled task", () => {
    const scheduled = DateTime.fromISO("2026-08-11T09:00:00");
    const destination = shiftForScheduledTask(shifts, scheduled.toMillis());
    expect(destination.label).toBe("1");
    expect(destination.start.toISO()).toBe(DateTime.fromISO("2026-08-11T08:00:00").toISO());
    expect(destination.end.toISO()).toBe(DateTime.fromISO("2026-08-11T19:00:00").toISO());
  });
});

describe("Nursing task payload parity", () => {
  it("builds the scheduled medication administration contract in seconds", () => {
    const actual = Date.parse("2026-08-10T10:15:00Z");
    expect(buildMedicationAdministration(task(), "complete", actual, "Administrada", "provider-1")).toEqual({
      patientUuid: "patient-1",
      orderUuid: "order-1",
      providers: [{ providerUuid: "provider-1", function: "Performer" }],
      notes: [{ authorUuid: "provider-1", text: "Administrada" }],
      status: "completed",
      slotUuid: "slot-1",
      administeredDateTime: actual / 1_000,
    });
  });

  it("uses the scheduled slot time when a medication is omitted", () => {
    const result = buildMedicationAdministration(task(), "skip", Date.now(), "Paciente ausente", "provider-1");
    expect(result.status).toBe("not-done");
    expect(result.administeredDateTime).toBe(task().scheduledTime / 1_000);
  });

  it("builds FHIR Task-compatible non-medication updates in milliseconds", () => {
    const nonMedication = task({ kind: "non-medication" });
    expect(buildNonMedicationUpdate(nonMedication, "complete", 1234, "")).toEqual({ uuid: "slot-1", status: "COMPLETED", executionEndTime: 1234 });
    expect(buildNonMedicationUpdate(nonMedication, "skip", 5678, "No realizado")).toEqual({ uuid: "slot-1", status: "REJECTED", executionEndTime: 5678, comment: "No realizado" });
  });

  it("requires notes only after the configured medication window", () => {
    const scheduled = task().scheduledTime;
    expect(medicationCompletionNeedsNotes(task(), scheduled + 60 * 60_000, 60)).toBe(false);
    expect(medicationCompletionNeedsNotes(task(), scheduled + 60 * 60_000 + 1, 60)).toBe(true);
    expect(medicationCompletionNeedsNotes(task({ extensions: { order: { asNeeded: true } } }), scheduled + 4 * 60 * 60_000, 60)).toBe(false);
  });
});
