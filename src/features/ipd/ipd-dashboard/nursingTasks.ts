import { DateTime } from "luxon";
import type { IpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";
import type { CareTask } from "@/features/ipd/care-view/types";
import type {
  NonMedicationTaskUpdatePayload,
  ScheduledMedicationAdministrationPayload,
} from "@/services/bahmni/careView";
import type { IpdShiftWindow } from "./domain";
import { currentIpdShift } from "./domain";

export type NursingTaskFilter = "all" | "completed" | "pending" | "prn" | "stopped" | "skipped" | "missed";
export type NursingTaskAction = "complete" | "skip";

// Legacy allows reviewing nursing-task shifts up to two days ahead of the
// current shift. Keep this rule here so task creation and navigation share
// the same horizon instead of leaving newly scheduled tasks inaccessible.
export const NURSING_TASK_FUTURE_DAYS = 2;

export function canAddNursingTask(options: {
  readOnly: boolean;
  currentShift: boolean;
  canAddNonMedication: boolean;
  canAddAdhocMedication: boolean;
}): boolean {
  return !options.readOnly
    && options.currentShift
    && (options.canAddNonMedication || options.canAddAdhocMedication);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truthy(value: unknown): boolean {
  return value === true || value === "true";
}

export function medicationOrderUuid(task: CareTask): string | undefined {
  return text(object(task.extensions.order ?? task.extensions.drugOrder).uuid);
}

export function isPrnMedication(task: CareTask): boolean {
  if (task.kind !== "medication") return false;
  const order = object(task.extensions.order ?? task.extensions.drugOrder);
  return truthy(order.asNeeded) || truthy(object(order.dosingInstructions).asNeeded)
    || /asneeded|prn/i.test(text(task.extensions.serviceType) ?? "");
}

export function isSystemGeneratedTask(task: CareTask): boolean {
  const creator = object(task.extensions.creator ?? task.extensions.createdBy);
  return /daemon/i.test(task.creator ?? text(creator.username) ?? text(creator.display) ?? "");
}

export function taskRequiredPrivilege(task: CareTask): string {
  if (task.kind === "non-medication") return "Edit Tasks";
  return isPrnMedication(task) ? "Edit adhoc medication tasks" : "Edit Medication Administration";
}

export function isTaskRelevant(task: CareTask, nowMillis: number, relevantMinutes = 0): boolean {
  return task.scheduledTime <= nowMillis + relevantMinutes * 60_000;
}

export function isTaskFinal(task: CareTask): boolean {
  return task.status === "administered" || task.status === "administered-late"
    || task.status === "missed" || task.status === "stopped";
}

export function matchesNursingTaskFilter(task: CareTask, filter: NursingTaskFilter): boolean {
  const raw = (task.rawStatus ?? "").toUpperCase().replaceAll("-", "_");
  if (filter === "all") return true;
  if (filter === "completed") return task.status === "administered" || task.status === "administered-late";
  if (filter === "pending") return task.status === "pending" || task.status === "late";
  if (filter === "prn") return isPrnMedication(task);
  if (filter === "stopped") return task.status === "stopped" || raw === "STOPPED";
  if (filter === "skipped") return raw === "NOT_DONE" || raw === "REJECTED";
  return raw === "MISSED";
}

export function medicationCompletionNeedsNotes(task: CareTask, actualMillis: number, lateMinutes: number): boolean {
  return !isPrnMedication(task) && actualMillis > task.scheduledTime + lateMinutes * 60_000;
}

export function buildMedicationAdministration(
  task: CareTask,
  action: NursingTaskAction,
  actualMillis: number,
  notes: string,
  providerUuid: string,
): ScheduledMedicationAdministrationPayload {
  const orderUuid = medicationOrderUuid(task);
  if (!orderUuid) throw new Error("La tarea no contiene la orden farmacológica requerida por OpenMRS.");
  return {
    patientUuid: task.patientUuid,
    orderUuid,
    providers: [{ providerUuid, function: "Performer" }],
    notes: notes.trim() ? [{ authorUuid: providerUuid, text: notes.trim() }] : [],
    status: action === "complete" ? "completed" : "not-done",
    slotUuid: task.uuid,
    administeredDateTime: Math.floor((action === "complete" ? actualMillis : task.scheduledTime) / 1_000),
  };
}

export function buildNonMedicationUpdate(
  task: CareTask,
  action: NursingTaskAction,
  actualMillis: number,
  notes: string,
): NonMedicationTaskUpdatePayload {
  return action === "complete"
    ? { uuid: task.uuid, status: "COMPLETED", executionEndTime: actualMillis }
    : { uuid: task.uuid, status: "REJECTED", executionEndTime: actualMillis, comment: notes.trim() };
}

export function adjacentIpdShift(
  shiftDetails: IpdDashboardConfig["shiftDetails"],
  shift: IpdShiftWindow,
  direction: -1 | 1,
): IpdShiftWindow {
  const anchor = direction < 0 ? shift.start.minus({ milliseconds: 1 }) : shift.end.plus({ milliseconds: 1 });
  return currentIpdShift(shiftDetails, anchor);
}

export function nursingTaskFutureLimit(liveShift: IpdShiftWindow): DateTime {
  return liveShift.start.plus({ days: NURSING_TASK_FUTURE_DAYS });
}

export function canNavigateToNextIpdShift(
  shift: IpdShiftWindow,
  liveShift: IpdShiftWindow,
): boolean {
  return shift.end < nursingTaskFutureLimit(liveShift);
}

export function shiftForScheduledTask(
  shiftDetails: IpdDashboardConfig["shiftDetails"],
  scheduledTime: number,
): IpdShiftWindow {
  return currentIpdShift(shiftDetails, DateTime.fromMillis(scheduledTime));
}

export function sameShift(left: IpdShiftWindow, right: IpdShiftWindow): boolean {
  return left.start.toMillis() === right.start.toMillis() && left.end.toMillis() === right.end.toMillis();
}

export function taskDateTime(task: CareTask): DateTime {
  return DateTime.fromMillis(task.scheduledTime);
}
