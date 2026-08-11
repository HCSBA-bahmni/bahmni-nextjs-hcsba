import type { DrugOrderRow } from "@/features/clinical/drugOrders";

export interface TreatmentScheduleConfig {
  enable24HourTimers: boolean;
  drugChartStartTimeFrequencies: string[];
  drugChartScheduleFrequencies: Array<{
    name: string;
    frequencyPerDay: number;
    scheduleTiming: string[];
  }>;
  timeInMinutesToDisableSlotPostScheduledTime: number;
}

export type TreatmentScheduleActionKind = "add" | "add-prn" | "edit" | "stop";

export interface TreatmentScheduleAction {
  kind: TreatmentScheduleActionKind;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

export interface TreatmentScheduleDraft {
  kind: "fixed" | "start" | "prn" | "unsupported";
  startTime: string;
  firstDayTimes: string[];
  dailyTimes: string[];
  remainingDayTimes: string[];
  missedFirstDaySlots: number;
}

export interface MedicationSchedulePayload {
  providerUuid: string;
  patientUuid: string;
  orderUuid: string;
  comments: string;
  serviceType: "MEDICATION_REQUEST" | "AS_NEEDED_PLACEHOLDER";
  slotStartTime?: number | null;
  firstDaySlotsStartTime?: number[] | null;
  dayWiseSlotsStartTime?: number[] | null;
  remainingDaySlotsStartTime?: number[] | null;
  medicationFrequency?: "START_TIME_DURATION_FREQUENCY" | "FIXED_SCHEDULE_FREQUENCY" | "";
}

function epochMillis(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== "") return Math.abs(numeric) < 100_000_000_000 ? numeric * 1_000 : numeric;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function timeParts(value: string): [number, number] | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? [hour, minute] : undefined;
}

export function normalizeScheduleTime(value: string): string {
  const parts = timeParts(value);
  return parts ? `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}` : "";
}

function timeFromEpoch(value: number | undefined): string {
  if (value === undefined) return "";
  const millis = epochMillis(value);
  if (millis === undefined) return "";
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? "" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function secondsOnOrderDate(order: DrugOrderRow, value: string, dayOffset = 0): number {
  const parts = timeParts(value);
  if (!parts) throw new Error("La hora indicada no es válida.");
  const baseMillis = epochMillis(order.scheduledDate ?? order.startDate) ?? Date.now();
  const base = new Date(baseMillis);
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, parts[0], parts[1], 0, 0);
  return Math.floor(local.getTime() / 1_000);
}

function configuredFixedFrequency(order: DrugOrderRow, config: TreatmentScheduleConfig) {
  return order.durationCount && order.frequency
    ? config.drugChartScheduleFrequencies.find((candidate) => candidate.name === order.frequency)
    : undefined;
}

function hasStartTimeFrequency(order: DrugOrderRow, config: TreatmentScheduleConfig): boolean {
  return config.drugChartStartTimeFrequencies.includes(order.frequency)
    || !order.frequency
    || !order.durationCount;
}

export function resolveTreatmentScheduleAction(order: DrugOrderRow, options: {
  hasPrivilege: boolean;
  readOnly: boolean;
  admitted: boolean;
  prnScheduled?: boolean;
  now?: number;
}): TreatmentScheduleAction | undefined {
  if (!options.hasPrivilege || Boolean(order.stopDate) || order.status === "stopped" || order.isVariableDose) return undefined;
  const scheduleExists = Boolean(order.schedule) || (order.asNeeded && options.prnScheduled === true);
  let kind: TreatmentScheduleActionKind;
  let label: string;
  if (!scheduleExists) {
    kind = order.asNeeded ? "add-prn" : "add";
    label = order.asNeeded ? "Añadir tarea" : "Programar";
  } else if (order.schedule?.medicationAdministrationStarted !== true && !order.asNeeded) {
    kind = "edit";
    label = "Editar";
  } else if (order.schedule?.pendingSlotsAvailable === true || order.asNeeded) {
    kind = "stop";
    label = "Detener";
  } else return undefined;

  const startsAt = epochMillis(order.startDate);
  const futureStart = (kind === "add" || kind === "add-prn") && startsAt !== undefined && (options.now ?? Date.now()) <= startsAt;
  const disabledReason = options.readOnly
    ? "La visita está cerrada y sólo permite consulta."
    : !options.admitted
      ? "El paciente no tiene una admisión activa."
      : futureStart
        ? "La programación se habilita cuando comienza el tratamiento."
        : undefined;
  return { kind, label, disabled: Boolean(disabledReason), disabledReason };
}

function initialFixedTimes(scheduleTiming: string[], thresholdMinutes: number, now: Date) {
  const normalized = scheduleTiming.map(normalizeScheduleTime).filter(Boolean);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const firstDayTimes: string[] = [];
  let missed = 0;
  for (const value of normalized) {
    const [hour, minute] = timeParts(value)!;
    const scheduledMinutes = hour * 60 + minute;
    if (nowMinutes > scheduledMinutes + thresholdMinutes) {
      firstDayTimes.push("");
      missed += 1;
    } else if (nowMinutes >= scheduledMinutes && nowMinutes - scheduledMinutes <= thresholdMinutes) {
      firstDayTimes.push(current);
    } else firstDayTimes.push(value);
  }
  if (missed === normalized.length && normalized.length > 0) {
    firstDayTimes.splice(0, firstDayTimes.length, ...Array.from({ length: normalized.length - 1 }, () => ""), current);
    missed = normalized.length - 1;
  }
  return {
    firstDayTimes,
    dailyTimes: normalized,
    remainingDayTimes: normalized.slice(0, missed),
    missed,
  };
}

export function createTreatmentScheduleDraft(order: DrugOrderRow, config: TreatmentScheduleConfig, now = new Date()): TreatmentScheduleDraft {
  if (order.asNeeded) return { kind: "prn", startTime: "", firstDayTimes: [], dailyTimes: [], remainingDayTimes: [], missedFirstDaySlots: 0 };
  const fixed = configuredFixedFrequency(order, config);
  if (fixed) {
    if (order.schedule) {
      const first = order.schedule.firstDaySlotsStartTime.map(timeFromEpoch);
      const missed = Math.max(0, fixed.frequencyPerDay - first.length);
      return {
        kind: "fixed",
        startTime: "",
        firstDayTimes: [...Array.from({ length: missed }, () => ""), ...first],
        dailyTimes: order.schedule.dayWiseSlotsStartTime.map(timeFromEpoch),
        remainingDayTimes: order.schedule.remainingDaySlotsStartTime.map(timeFromEpoch),
        missedFirstDaySlots: missed,
      };
    }
    const initial = initialFixedTimes(fixed.scheduleTiming, config.timeInMinutesToDisableSlotPostScheduledTime, now);
    return { kind: "fixed", startTime: "", firstDayTimes: initial.firstDayTimes, dailyTimes: initial.dailyTimes, remainingDayTimes: initial.remainingDayTimes, missedFirstDaySlots: initial.missed };
  }
  if (hasStartTimeFrequency(order, config)) {
    return { kind: "start", startTime: timeFromEpoch(order.schedule?.slotStartTime), firstDayTimes: [], dailyTimes: [], remainingDayTimes: [], missedFirstDaySlots: 0 };
  }
  return { kind: "unsupported", startTime: "", firstDayTimes: [], dailyTimes: [], remainingDayTimes: [], missedFirstDaySlots: 0 };
}

function validateOrderedTimes(values: string[], allowEmpty: boolean): string | undefined {
  const present = values.filter(Boolean);
  if (!allowEmpty && present.length !== values.length) return "Complete todos los horarios requeridos.";
  if (present.some((value) => !timeParts(value))) return "Revise el formato de los horarios.";
  const minutes = present.map((value) => { const [hour, minute] = timeParts(value)!; return hour * 60 + minute; });
  if (minutes.some((value, index) => index > 0 && value <= minutes[index - 1]!)) return "Los horarios deben estar en orden ascendente.";
  return undefined;
}

export function validateTreatmentScheduleDraft(draft: TreatmentScheduleDraft): string | undefined {
  if (draft.kind === "unsupported") return "La frecuencia de este tratamiento no tiene una estrategia configurada para el gráfico de medicamentos.";
  if (draft.kind === "start") return timeParts(draft.startTime) ? undefined : "Indique una hora de inicio válida.";
  if (draft.kind === "fixed") return validateOrderedTimes(draft.firstDayTimes, true)
    ?? validateOrderedTimes(draft.dailyTimes, false)
    ?? validateOrderedTimes(draft.remainingDayTimes, false);
  return undefined;
}

export function buildMedicationSchedulePayload(input: {
  patientUuid: string;
  providerUuid: string;
  order: DrugOrderRow;
  comments: string;
  draft: TreatmentScheduleDraft;
}): MedicationSchedulePayload {
  const { order, draft } = input;
  const error = validateTreatmentScheduleDraft(draft);
  if (error) throw new Error(error);
  const base = {
    providerUuid: input.providerUuid,
    patientUuid: input.patientUuid,
    orderUuid: order.uuid,
    comments: input.comments,
  };
  if (draft.kind === "prn") return { ...base, serviceType: "AS_NEEDED_PLACEHOLDER" };
  if (draft.kind === "start") return {
    ...base,
    serviceType: "MEDICATION_REQUEST",
    slotStartTime: secondsOnOrderDate(order, draft.startTime),
    firstDaySlotsStartTime: null,
    dayWiseSlotsStartTime: null,
    remainingDaySlotsStartTime: null,
    medicationFrequency: "START_TIME_DURATION_FREQUENCY",
  };
  const duration = Math.max(0, order.durationCount ?? 0);
  const dayOffset = draft.firstDayTimes.some((value) => !value) ? 1 : 0;
  return {
    ...base,
    serviceType: "MEDICATION_REQUEST",
    slotStartTime: null,
    firstDaySlotsStartTime: draft.firstDayTimes.filter(Boolean).map((value) => secondsOnOrderDate(order, value)),
    dayWiseSlotsStartTime: draft.dailyTimes.map((value) => secondsOnOrderDate(order, value, dayOffset)),
    remainingDaySlotsStartTime: draft.remainingDayTimes
      .map((value) => secondsOnOrderDate(order, value, duration))
      .slice(0, draft.missedFirstDaySlots),
    medicationFrequency: "FIXED_SCHEDULE_FREQUENCY",
  };
}
