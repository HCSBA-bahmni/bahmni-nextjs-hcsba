import { DateTime } from "luxon";
import type { CareShiftConfig, IpdOperationalConfig } from "@/config-compat/careViewConfig";
import type { CareTask, CareTaskKind, CareTaskStatus, CareTimeWindow, CareTeamParticipant, CareViewPatient } from "./types";

export function careViewPatientDashboardHref(patient: Pick<CareViewPatient, "uuid" | "visitUuid">): string {
  const patientUuid = encodeURIComponent(patient.uuid);
  return patient.visitUuid
    ? `/clinical/patient/${patientUuid}/dashboard/visit/ipd/${encodeURIComponent(patient.visitUuid)}?source=careViewDashboard`
    : `/bedmanagement/patient/${patientUuid}`;
}

function timeParts(value: string): [number, number] {
  const [hour = "0", minute = "0"] = value.split(":");
  return [Number(hour), Number(minute)];
}

function shiftOnDate(date: DateTime, shift: CareShiftConfig): { start: DateTime; end: DateTime } {
  const [startHour, startMinute] = timeParts(shift.startTime);
  const [endHour, endMinute] = timeParts(shift.endTime);
  const start = date.startOf("day").set({ hour: startHour, minute: startMinute });
  let end = date.startOf("day").set({ hour: endHour, minute: endMinute });
  if (end <= start) end = end.plus({ days: 1 });
  return { start, end };
}

export function resolveShift(moment: DateTime, shifts: CareShiftConfig[]): { shift: CareShiftConfig; start: DateTime; end: DateTime } {
  for (const dayOffset of [0, -1]) {
    for (const shift of shifts) {
      const candidate = shiftOnDate(moment.plus({ days: dayOffset }), shift);
      if (moment >= candidate.start && moment < candidate.end) return { shift, ...candidate };
    }
  }
  const fallback = shifts[0] ?? { id: "default", startTime: "00:00", endTime: "00:00" };
  return { shift: fallback, ...shiftOnDate(moment, fallback) };
}

export function buildCareWindow(moment: DateTime, shifts: CareShiftConfig[], windowHours: number): CareTimeWindow {
  const resolved = resolveShift(moment, shifts);
  const elapsedHours = Math.max(0, moment.diff(resolved.start, "hours").hours);
  const index = Math.floor(elapsedHours / windowHours);
  const start = resolved.start.plus({ hours: index * windowHours });
  const end = DateTime.min(start.plus({ hours: windowHours }), resolved.end);
  return { shiftId: resolved.shift.id, shiftStart: resolved.start, shiftEnd: resolved.end, start, end, current: true };
}

export function moveCareWindow(window: CareTimeWindow, direction: -1 | 1, windowHours: number, now: DateTime = DateTime.local()): CareTimeWindow | null {
  const start = window.start.plus({ hours: direction * windowHours });
  const end = start.plus({ hours: windowHours });
  if (start < window.shiftStart || start >= window.shiftEnd) return null;
  const boundedEnd = DateTime.min(end, window.shiftEnd);
  return { ...window, start, end: boundedEnd, current: now >= start && now < boundedEnd };
}

export function previousShiftWindow(window: CareTimeWindow, shifts: CareShiftConfig[]): { start: DateTime; end: DateTime } {
  const previousMoment = window.shiftStart.minus({ minutes: 1 });
  const previous = resolveShift(previousMoment, shifts);
  return { start: previous.start, end: previous.end };
}

export function careWindowSlots(window: CareTimeWindow): Array<{ start: DateTime; end: DateTime }> {
  const slots: Array<{ start: DateTime; end: DateTime }> = [];
  let cursor = window.start;
  while (cursor < window.end) {
    const end = DateTime.min(cursor.plus({ hours: 1 }), window.end);
    slots.push({ start: cursor, end });
    cursor = end;
  }
  return slots;
}

export function classifyTaskStatus(input: {
  rawStatus?: string;
  scheduledTime: number;
  completedTime?: number;
  now?: number;
  pastLateMinutes: number;
  administeredLateMinutes: number;
  voided?: boolean;
}): CareTaskStatus {
  const status = (input.rawStatus ?? "REQUESTED").toUpperCase().replaceAll(" ", "_");
  if (input.voided || status.includes("STOP") || status === "CANCELLED") return "stopped";
  if (status.includes("NOT_ADMIN") || status.includes("MISS") || status === "OMITTED") return "missed";
  if (status.includes("ADMINISTER") || status === "COMPLETED" || status === "DONE") {
    const completed = input.completedTime ?? input.scheduledTime;
    return completed > input.scheduledTime + input.administeredLateMinutes * 60_000 ? "administered-late" : "administered";
  }
  const now = input.now ?? Date.now();
  return now > input.scheduledTime + input.pastLateMinutes * 60_000 ? "late" : "pending";
}

export function taskThresholds(config: IpdOperationalConfig, kind: CareTaskKind) {
  return kind === "medication" ? config.drugChart : {
    pastLateMinutes: config.nursingTasks.pastLateMinutes,
    administeredLateMinutes: config.nursingTasks.administeredLateMinutes,
  };
}

export function isPreviousPending(task: CareTask, previous: { start: DateTime; end: DateTime }): boolean {
  const creator = (task.creator ?? "").toLowerCase();
  return task.status === "pending"
    && (creator === "daemon" || creator.includes("daemon"))
    && task.scheduledTime >= previous.start.toMillis()
    && task.scheduledTime < previous.end.toMillis();
}

export type CareTeamAction = "assign" | "remove" | "blocked";

export function careTeamAction(participants: CareTeamParticipant[], providerUuid: string, window: CareTimeWindow, now: DateTime = DateTime.local()): CareTeamAction {
  if (!(now >= window.shiftStart && now < window.shiftEnd)) return "blocked";
  const active = participants.find((participant) => !participant.voided && (!participant.endTime || participant.endTime > now.toMillis()));
  if (!active) return "assign";
  return active.providerUuid === providerUuid ? "remove" : "blocked";
}

const selectedWardsKey = "selected_wards";

export function readSelectedWard(storage: Pick<Storage, "getItem">, providerUuid: string): string | undefined {
  try {
    const value = JSON.parse(storage.getItem(selectedWardsKey) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const selected = (value as Record<string, unknown>)[providerUuid];
    return typeof selected === "string" ? selected : undefined;
  } catch {
    return undefined;
  }
}

export function saveSelectedWard(storage: Pick<Storage, "getItem" | "setItem">, providerUuid: string, wardUuid: string): void {
  let values: Record<string, unknown> = {};
  try {
    const stored = JSON.parse(storage.getItem(selectedWardsKey) ?? "{}") as unknown;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) values = stored as Record<string, unknown>;
  } catch {
    values = {};
  }
  storage.setItem(selectedWardsKey, JSON.stringify({ ...values, [providerUuid]: wardUuid }));
}
