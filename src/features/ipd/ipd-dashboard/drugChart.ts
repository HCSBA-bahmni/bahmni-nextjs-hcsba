import type { DrugRecord } from "@/features/clinical/drugOrders";
import { normalizeTreatmentSections } from "@/features/clinical/drugOrders";
import type { CareTask } from "@/features/ipd/care-view/types";
import type { IpdShiftWindow } from "./domain";
import { medicationOrderUuid } from "./nursingTasks";

export interface DrugChartMedication {
  uuid: string;
  name: string;
  details: string;
  firstSlotTime?: number;
}

export interface DrugChartInterval {
  start: number;
  end: number;
}

export interface DrugChartRow extends DrugChartMedication {
  tasks: CareTask[];
}

function record(value: unknown): DrugRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DrugRecord : {};
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const item = record(value);
  return display(item.display ?? item.name ?? item.value);
}

function epochMillis(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? (parsed < 10_000_000_000 ? parsed * 1_000 : parsed) : undefined;
}

function firstScheduleTime(schedule: NonNullable<ReturnType<typeof normalizeTreatmentSections>[number]["orders"][number]["schedule"]>): number | undefined {
  const values = [
    schedule.slotStartTime,
    ...schedule.firstDaySlotsStartTime,
    ...schedule.dayWiseSlotsStartTime,
    ...schedule.remainingDaySlotsStartTime,
  ].map(epochMillis).filter((value): value is number => value !== undefined);
  return values.length ? Math.min(...values) : undefined;
}

/** Legacy builds the chart rows from the visit medication contract and only
 * overlays the slots returned for the selected shift. This intentionally
 * keeps a scheduled medicine visible even when its treatment ended before the
 * shift being reviewed. */
export function normalizeDrugChartMedications(response: DrugRecord, visitUuid: string): DrugChartMedication[] {
  const scheduled = normalizeTreatmentSections(response, false, true, visitUuid)
    .flatMap((section) => section.orders)
    .filter((order) => order.schedule)
    .map((order): DrugChartMedication => ({
      uuid: order.uuid,
      name: order.name,
      details: [order.dose === "—" ? "" : order.dose, order.route === "—" ? "" : order.route, order.duration].filter(Boolean).join(" · "),
      firstSlotTime: firstScheduleTime(order.schedule!),
    }));

  const emergency = (Array.isArray(response.emergencyMedications) ? response.emergencyMedications : [])
    .map(record)
    .map((medication): DrugChartMedication | undefined => {
      const uuid = display(medication.uuid);
      if (!uuid) return undefined;
      const drug = record(medication.drug);
      const doseUnits = display(record(medication.doseUnits).display ?? medication.doseUnits);
      return {
        uuid,
        name: display(drug.display ?? drug.name) || "Medicamento",
        details: [display(medication.dose), doseUnits, display(record(medication.route).display ?? medication.route)].filter(Boolean).join(" · "),
        firstSlotTime: epochMillis(medication.administeredDateTime),
      };
    })
    .filter((medication): medication is DrugChartMedication => medication !== undefined);

  return [...scheduled, ...emergency].sort((left, right) =>
    (left.firstSlotTime ?? Number.MAX_SAFE_INTEGER) - (right.firstSlotTime ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name));
}

function taskMedicationUuid(task: CareTask): string | undefined {
  const orderUuid = medicationOrderUuid(task);
  if (orderUuid) return orderUuid;
  return display(record(task.extensions.medicationAdministration ?? task.extensions.administration).uuid) || undefined;
}

export function buildDrugChartRows(medications: DrugChartMedication[], tasks: CareTask[]): DrugChartRow[] {
  const assigned = new Set<string>();
  const rows = medications.map((medication): DrugChartRow => {
    const rowTasks = tasks.filter((task) => {
      const matches = taskMedicationUuid(task) === medication.uuid;
      if (matches) assigned.add(task.uuid);
      return matches;
    });
    return { ...medication, tasks: rowTasks };
  });

  for (const task of tasks) {
    if (assigned.has(task.uuid)) continue;
    const existing = rows.find((row) => row.name === task.name);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    rows.push({
      uuid: taskMedicationUuid(task) ?? task.uuid,
      name: task.name,
      details: [task.dose, task.doseUnit, task.route].filter((value) => value !== undefined && value !== "").join(" · "),
      firstSlotTime: task.scheduledTime,
      tasks: [task],
    });
  }

  return rows;
}

export function drugChartIntervals(shift: IpdShiftWindow, minutes = 30): DrugChartInterval[] {
  const intervals: DrugChartInterval[] = [];
  let cursor = shift.start;
  while (cursor < shift.end) {
    const end = cursor.plus({ minutes });
    intervals.push({ start: cursor.toMillis(), end: Math.min(end.toMillis(), shift.end.toMillis()) });
    cursor = end;
  }
  return intervals;
}

export function drugChartTaskTime(task: CareTask): number {
  return (task.status === "administered" || task.status === "administered-late")
    ? task.completedTime ?? task.scheduledTime
    : task.scheduledTime;
}

export function tasksInDrugChartInterval(tasks: CareTask[], interval: DrugChartInterval): CareTask[] {
  return tasks.filter((task) => {
    const time = drugChartTaskTime(task);
    return time >= interval.start && time < interval.end;
  });
}
