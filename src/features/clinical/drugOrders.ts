export type DrugRecord = Record<string, unknown>;

export interface DrugOrderRow {
  uuid: string;
  name: string;
  dose: string;
  doseValue?: number | string;
  doseUnit?: string;
  quantity: string;
  route: string;
  frequency: string;
  drugForm: string;
  duration: string;
  durationValue?: number | string;
  durationUnit?: string;
  startDate?: string | number;
  stopDate?: string | number | null;
  plannedEndDate?: string | number;
  recordedDateTime?: string | number;
  scheduledDate?: string | number;
  visitUuid?: string;
  visitDate?: string | number;
  instructions: string;
  additionalInstructions: string;
  rate?: number | string;
  additives?: string;
  provider: string;
  providerUuid?: string;
  active: boolean;
  status: "" | "in-progress" | "completed" | "stopped";
  stopReason: string;
  asNeeded: boolean;
  immediately: boolean;
  emergency: boolean;
  medicationAdministrationStarted: boolean;
  durationCount?: number;
  isVariableDose?: boolean;
  schedule?: {
    slotStartTime?: number;
    firstDaySlotsStartTime: number[];
    dayWiseSlotsStartTime: number[];
    remainingDaySlotsStartTime: number[];
    notes: string;
    medicationAdministrationStarted: boolean;
    pendingSlotsAvailable: boolean;
    allSlotsAttended: boolean;
  };
  orderNumber: number;
  raw: DrugRecord;
}

const record = (value: unknown): DrugRecord => value && typeof value === "object" && !Array.isArray(value) ? value as DrugRecord : {};
const display = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  const item = record(value);
  return display(item.display ?? item.name ?? item.value ?? item.uuid);
};
const parseInstructions = (value: unknown): DrugRecord => {
  if (typeof value !== "string" || !value.trim()) return {};
  try { return record(JSON.parse(value)); } catch { return { instructions: value }; }
};
const orderRecord = (value: DrugRecord): DrugRecord => {
  const nested = record(value.drugOrder);
  return Object.keys(nested).length ? nested : value;
};
const scheduleRecord = (value: DrugRecord): DrugRecord => record(value.drugOrderSchedule ?? orderRecord(value).drugOrderSchedule);
const flattenOrder = (value: DrugRecord): DrugRecord => {
  const item = orderRecord(value);
  if (item === value) return value;
  return {
    ...item,
    provider: value.provider ?? item.provider,
    drugOrderSchedule: value.drugOrderSchedule ?? item.drugOrderSchedule,
    instructions: value.instructions ?? item.instructions,
    additionalInstructions: value.additionalInstructions ?? item.additionalInstructions,
    emergency: value.emergency ?? item.emergency,
  };
};
const time = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};
const numbers = (value: unknown): number[] => Array.isArray(value)
  ? value.map(Number).filter(Number.isFinite)
  : [];
const dayDifference = (left: unknown, right: unknown): number => Math.abs(time(left) - time(right)) / 86_400_000;
const continuousSignature = (item: DrugRecord): string => {
  const dosing = record(item.dosingInstructions);
  const administration = parseInstructions(dosing.administrationInstructions);
  return JSON.stringify({
    drugNonCoded: display(item.drugNonCoded),
    drugUuid: display(record(item.drug).uuid),
    instructions: display(administration.instructions),
    dose: display(dosing.dose),
    doseUnits: display(dosing.doseUnits),
    route: display(dosing.route),
    frequency: display(dosing.frequency),
    additionalInstructions: display(administration.additionalInstructions),
    asNeeded: Boolean(dosing.asNeeded ?? item.asNeeded),
    stopped: Boolean(item.dateStopped || String(item.action ?? "").toUpperCase() === "DISCONTINUE"),
  });
};

/** Port of legacy `mergeContinuousTreatments`: adjacent orders with identical
 * posology are shown as one continuous prescription span. */
export function mergeContinuousDrugOrders(items: DrugRecord[]): DrugRecord[] {
  const merged: DrugRecord[] = [];
  [...items].sort((left, right) => time(left.effectiveStartDate) - time(right.effectiveStartDate)).forEach((item) => {
    const signature = continuousSignature(item);
    const candidate = merged.find((current) => continuousSignature(current) === signature && dayDifference(current.effectiveStopDate, item.scheduledDate ?? item.effectiveStartDate) <= 1);
    if (!candidate) { merged.push({ ...item }); return; }
    if (display(candidate.durationUnits) === display(item.durationUnits)) candidate.duration = (Number(candidate.duration) || 0) + (Number(item.duration) || 0);
    candidate.effectiveStopDate = item.effectiveStopDate;
  });
  return merged;
}

export function isActiveOrScheduledDrugOrder(item: DrugRecord, now = Date.now()): boolean {
  if (item.dateStopped || String(item.action ?? "").toUpperCase() === "DISCONTINUE") return false;
  const stop = time(item.effectiveStopDate);
  return !stop || stop >= now;
}

export function normalizeDrugOrders(items: DrugRecord[], showOnlyActive: boolean, now = Date.now()): DrugOrderRow[] {
  return items.map((wrapper, index): DrugOrderRow => {
    const item = orderRecord(wrapper);
    const dosing = record(item.dosingInstructions);
    const administration = {
      ...parseInstructions(dosing.administrationInstructions),
      ...record(wrapper.administrationInstructions),
    };
    const dose = [display(dosing.dose ?? administration.dose), display(dosing.doseUnits ?? administration.doseUnits)].filter(Boolean).join(" ");
    const doseValue = dosing.dose ?? administration.dose;
    const doseUnit = display(dosing.doseUnits ?? administration.doseUnits);
    const durationValue = item.duration ?? dosing.duration;
    const rate = administration.rate ?? wrapper.rate;
    const quantity = [display(dosing.quantity), display(dosing.quantityUnits)].filter(Boolean).join(" ");
    const provider = record(wrapper.provider ?? item.provider ?? item.orderer);
    const schedule = scheduleRecord(wrapper);
    const hasSchedule = Object.keys(schedule).length > 0;
    const stopped = Boolean(item.dateStopped || String(item.action ?? "").toUpperCase() === "DISCONTINUE");
    const allSlotsAttended = schedule.allSlotsAttended === true;
    const medicationAdministrationStarted = schedule.medicationAdministrationStarted === true;
    const autoExpireDate = time(item.autoExpireDate);
    const completed = allSlotsAttended || (Boolean(dosing.asNeeded) && autoExpireDate > 0 && autoExpireDate < now);
    const status: DrugOrderRow["status"] = stopped ? "stopped" : completed ? "completed" : medicationAdministrationStarted ? "in-progress" : "";
    const reasonConcept = record(item.orderReasonConcept);
    const stopReason = [display(reasonConcept.name ?? reasonConcept.display), display(item.orderReasonText)].filter(Boolean).join(" · ");
    const name = display(item.drugNonCoded ?? record(item.drug).display ?? record(item.drug).name ?? record(item.concept).display ?? record(item.concept).name);
    const orderNumber = Number(String(item.orderNumber ?? index).replace(/\D/g, "")) || index;
    return {
      uuid: display(item.uuid) || `drug-${index}`,
      name: name || "Medicamento",
      dose: dose || "—",
      doseValue: typeof doseValue === "number" || typeof doseValue === "string" ? doseValue : undefined,
      doseUnit,
      quantity: quantity || "—",
      route: display(dosing.route) || "—",
      frequency: display(dosing.frequency) || "—",
      drugForm: display(record(item.drug).dosageForm ?? record(item.drug).drugReferenceMap ?? record(item.concept).dosageForm) || "",
      duration: [display(item.duration ?? dosing.duration), display(item.durationUnits ?? dosing.durationUnits)].filter(Boolean).join(" "),
      durationValue: typeof durationValue === "number" || typeof durationValue === "string" ? durationValue : undefined,
      durationUnit: display(item.durationUnits ?? dosing.durationUnits),
      startDate: item.effectiveStartDate as string | number | undefined,
      stopDate: item.dateStopped === null || item.dateStopped === "" ? undefined : item.dateStopped as string | number | undefined,
      plannedEndDate: item.effectiveStopDate as string | number | undefined,
      recordedDateTime: (item.dateActivated ?? item.dateCreated) as string | number | undefined,
      scheduledDate: (item.scheduledDate ?? item.effectiveStartDate) as string | number | undefined,
      visitUuid: display(record(item.visit).uuid) || undefined,
      visitDate: (record(item.visit).startDateTime ?? record(item.visit).startDatetime) as string | number | undefined,
      instructions: display(administration.instructions ?? wrapper.instructions) || "",
      additionalInstructions: display(administration.additionalInstructions ?? wrapper.additionalInstructions) || "",
      rate: typeof rate === "number" || typeof rate === "string" ? rate : undefined,
      additives: display(administration.additives ?? wrapper.additives) || "",
      provider: display(provider.name ?? provider.display ?? item.creatorName) || "—",
      providerUuid: display(provider.uuid) || undefined,
      active: isActiveOrScheduledDrugOrder(item, now),
      status,
      stopReason,
      asNeeded: Boolean(dosing.asNeeded ?? item.asNeeded),
      immediately: Boolean(dosing.immediately ?? item.immediately),
      emergency: Boolean(dosing.emergency ?? item.emergency ?? wrapper.emergency),
      medicationAdministrationStarted,
      durationCount: Number.isFinite(Number(item.duration ?? dosing.duration)) ? Number(item.duration ?? dosing.duration) : undefined,
      isVariableDose: String(item.dosingInstructionType ?? "").toLocaleLowerCase().includes("variable"),
      schedule: hasSchedule ? {
        slotStartTime: Number.isFinite(Number(schedule.slotStartTime)) ? Number(schedule.slotStartTime) : undefined,
        firstDaySlotsStartTime: numbers(schedule.firstDaySlotsStartTime),
        dayWiseSlotsStartTime: numbers(schedule.dayWiseSlotsStartTime),
        remainingDaySlotsStartTime: numbers(schedule.remainingDaySlotsStartTime),
        notes: display(schedule.notes),
        medicationAdministrationStarted,
        pendingSlotsAvailable: schedule.pendingSlotsAvailable === true,
        allSlotsAttended,
      } : undefined,
      orderNumber,
      raw: item,
    };
  }).filter((item) => !showOnlyActive || item.active).sort((left, right) => {
    const dateDifference = time(left.startDate) - time(right.startDate);
    return dateDifference || left.orderNumber - right.orderNumber;
  });
}

export interface TreatmentSection {
  id: string;
  label: string;
  visitUuid?: string;
  date?: string | number;
  otherActive: boolean;
  orders: DrugOrderRow[];
}

/** Mirrors treatmentData.js: visit orders are grouped by visit start date and
 * `otherActiveDrugOrders` is kept as a separate final section. */
export function normalizeTreatmentSections(response: DrugRecord, showOnlyActive = false, legacyIpd = false, visitUuid?: string): TreatmentSection[] {
  const ipdOrders = Array.isArray(response.ipdDrugOrders) ? response.ipdDrugOrders as DrugRecord[] : [];
  if (legacyIpd && ipdOrders.length > 0) {
    const normalized = normalizeDrugOrders(ipdOrders.map(flattenOrder), showOnlyActive);
    return normalized.length > 0 ? [{
      id: `visit-${visitUuid ?? "ipd"}`,
      label: "Visita IPD",
      visitUuid,
      otherActive: false,
      orders: normalized,
    }] : [];
  }
  const visitOrders = Array.isArray(response.visitDrugOrders) ? response.visitDrugOrders as DrugRecord[] : [];
  const otherOrders = Array.isArray(response.otherActiveDrugOrders) ? response.otherActiveDrugOrders as DrugRecord[] : [];
  const grouped = new Map<string, DrugRecord[]>();
  const visible = (order: DrugRecord) => {
    const item = orderRecord(order);
    const orderVisitUuid = display(record(item.visit ?? order.visit).uuid);
    if (visitUuid && orderVisitUuid !== visitUuid) return false;
    if (!legacyIpd) return true;
    return !(item.dateStopped && scheduleRecord(order).medicationAdministrationStarted !== true);
  };
  visitOrders.filter(visible).forEach((order) => {
    const visit = record(orderRecord(order).visit ?? order.visit);
    const date = display(visit.startDateTime ?? visit.startDatetime) || "unknown";
    grouped.set(date, [...(grouped.get(date) ?? []), order]);
  });
  const sections = [...grouped.entries()].map(([key, orders]): TreatmentSection => {
    const first = orderRecord(orders[0] ?? {});
    const visit = record(first.visit ?? orders[0]?.visit);
    return { id: `visit-${display(visit.uuid) || key}`, label: "Visita", visitUuid: display(visit.uuid) || undefined, date: key === "unknown" ? undefined : key, otherActive: false, orders: normalizeDrugOrders(mergeContinuousDrugOrders(orders.map(flattenOrder)), showOnlyActive) };
  }).sort((left, right) => time(right.date) - time(left.date));
  const visibleOtherOrders = otherOrders.filter(visible);
  if (visibleOtherOrders.length) sections.push({ id: "other-active", label: "Otros tratamientos activos", otherActive: true, orders: normalizeDrugOrders(mergeContinuousDrugOrders(visibleOtherOrders.map(flattenOrder)), showOnlyActive) });
  return sections.filter((section) => section.orders.length > 0);
}
