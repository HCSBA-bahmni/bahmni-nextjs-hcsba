import type { ConsultationDrugOrder, MedicationConfig } from "./types";

export type MedicationRecord = Record<string, unknown>;

const object = (value: unknown): MedicationRecord => value && typeof value === "object" && !Array.isArray(value) ? value as MedicationRecord : {};
const records = (value: unknown): MedicationRecord[] => Array.isArray(value) ? value.filter((item): item is MedicationRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const valueText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const source = object(value);
  const candidate = source.display ?? source.name ?? source.value;
  return candidate === undefined || candidate === value ? "" : valueText(candidate);
};
const numberValue = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface MedicationCatalog {
  doseUnits: string[];
  routes: string[];
  durationUnits: string[];
  dispensingUnits: string[];
  dosingInstructions: string[];
  frequencies: Array<{ label: string; value: string; frequencyPerDay?: number }>;
  hiddenFields: string[];
  allowNonCodedDrugs: boolean;
}

export interface DrugSearchOption {
  label: string;
  value: string;
  drug: MedicationRecord;
}

export interface MedicationQuantityInput {
  dose?: number | null;
  doseFraction?: number | null;
  doseUnits?: string;
  frequency?: string;
  frequencyPerDay?: number;
  duration?: number | null;
  durationFactor?: number;
  quantity?: number | null;
  quantityUnits?: string;
  quantityEnteredManually?: boolean;
  quantityUnitEnteredManually?: boolean;
}

/** Port of DrugOrderViewModel.calculateQuantityAndUnit for uniform dosing. */
export function calculateMedicationQuantity(input: MedicationQuantityInput): Pick<MedicationQuantityInput, "quantity" | "quantityUnits"> {
  let quantity = input.quantity ?? null;
  if (!input.quantityEnteredManually) {
    const durationInDays = input.duration ? input.duration * (input.durationFactor ?? 1) : Number.NaN;
    const frequencyPerDay = input.frequency ? input.frequencyPerDay : 0;
    const calculated = ((input.dose || 0) + (input.doseFraction || 0)) * (frequencyPerDay as number) * durationInDays;
    quantity = Number.isFinite(calculated) ? Math.ceil(calculated) : null;
  }
  return {
    quantity,
    quantityUnits: input.quantityUnitEnteredManually ? input.quantityUnits : input.doseUnits,
  };
}

function names(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map(valueText).filter(Boolean);
}

export function medicationCatalog(raw: MedicationRecord, config: MedicationConfig): MedicationCatalog {
  const frequencyValues = records(raw.frequencies).flatMap((frequency) => {
    const name = valueText(frequency.name ?? frequency.display);
    if (!name) return [];
    const perDay = numberValue(frequency.frequencyPerDay);
    return [{ label: name, value: name, ...(perDay !== null ? { frequencyPerDay: perDay } : {}) }];
  });
  return {
    doseUnits: names(raw.doseUnits),
    routes: names(raw.routes),
    durationUnits: names(raw.durationUnits).length ? names(raw.durationUnits) : config.durationUnitsFactors.map((item) => item.name),
    dispensingUnits: names(raw.dispensingUnits),
    dosingInstructions: names(raw.dosingInstructions),
    frequencies: frequencyValues,
    hiddenFields: names(raw.hiddenFields),
    allowNonCodedDrugs: typeof raw.allowNonCodedDrugs === "boolean"
      ? raw.allowNonCodedDrugs
      : object(config.raw.inputOptionsConfig).allowOnlyCodedDrugs !== true,
  };
}

function matchesEveryWord(value: string, query: string): boolean {
  const normalized = value.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => normalized.includes(word));
}

/** Exact equivalent of legacy DrugSearchResult.getAllMatchingSynonyms. */
export function drugSearchOptions(drugs: MedicationRecord[], query: string): DrugSearchOption[] {
  return drugs.flatMap((drug) => {
    const concept = object(drug.concept);
    const drugName = valueText(drug.name ?? concept.name);
    if (!drugName) return [];
    const dosageForm = valueText(drug.dosageForm);
    const value = dosageForm ? `${drugName} (${dosageForm})` : drugName;
    if (matchesEveryWord(drugName, query)) return [{ label: value, value, drug }];
    const synonyms = [...new Set(records(concept.names).map((name) => valueText(name.name ?? name)).filter((name) => name && matchesEveryWord(name, query)))].sort();
    return synonyms.map((synonym) => ({ label: `${synonym} => ${value}`, value, drug }));
  });
}

export interface MedicationHistoryOrder {
  uuid: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
  additionalInstructions: string;
  provider: string;
  startDate?: string | number;
  stopDate?: string | number;
  visitDate?: string | number;
  active: boolean;
  scheduled: boolean;
  retired: boolean;
  canEdit: boolean;
  canDiscontinue: boolean;
  raw: MedicationRecord;
}

export interface MedicationHistoryGroup {
  id: string;
  label: string;
  recent: boolean;
  orders: MedicationHistoryOrder[];
}

function dateValue(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function time(value: unknown): number {
  const normalized = typeof value === "number" ? value : typeof value === "string" && /^\d{10,}$/.test(value) ? Number(value) : String(value ?? "");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMedicationDate(value: string | number | undefined, locale: string): string {
  if (value === undefined || value === "") return "";
  const parsed = time(value);
  if (!parsed) return "";
  try {
    return new Intl.DateTimeFormat(locale.replace(/_/g, "-"), { dateStyle: "medium" }).format(new Date(parsed));
  } catch {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(parsed));
  }
}

function dateOnly(value: string | number | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") {
    const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (isoDate) return isoDate;
  }
  const parsed = time(value);
  if (!parsed) return fallback;
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function medicationHistoryOrder(source: MedicationRecord, now = Date.now()): MedicationHistoryOrder {
  const dosing = object(source.dosingInstructions);
  const administration = (() => {
    const raw = dosing.administrationInstructions ?? source.administrationInstructions;
    if (typeof raw !== "string") return object(raw);
    try { return object(JSON.parse(raw)); } catch { return { instructions: raw }; }
  })();
  const visit = object(source.visit);
  const provider = object(source.provider);
  const startDate = dateValue(source.effectiveStartDate ?? source.scheduledDate);
  const stopDate = dateValue(source.dateStopped ?? source.effectiveStopDate);
  const stopped = Boolean(source.dateStopped) || String(source.action ?? "").toUpperCase() === "DISCONTINUE" || Boolean(stopDate && time(stopDate) < now);
  const drug = object(source.drug);
  const concept = object(source.concept);
  return {
    uuid: valueText(source.uuid),
    name: valueText(source.drugNonCoded ?? drug.display ?? drug.name ?? concept.display ?? concept.name) || "Medicamento",
    dose: [valueText(dosing.dose), valueText(dosing.doseUnits)].filter(Boolean).join(" "),
    route: valueText(dosing.route ?? source.route),
    frequency: valueText(dosing.frequency ?? source.frequency),
    duration: [valueText(source.duration ?? dosing.duration), valueText(source.durationUnits ?? dosing.durationUnits)].filter(Boolean).join(" "),
    quantity: [valueText(dosing.quantity ?? source.quantity), valueText(dosing.quantityUnits ?? source.quantityUnits)].filter(Boolean).join(" "),
    instructions: valueText(administration.instructions ?? source.instructions),
    additionalInstructions: valueText(administration.additionalInstructions ?? source.additionalInstructions),
    provider: valueText(provider.name ?? provider.display ?? source.creatorName),
    startDate,
    stopDate,
    visitDate: dateValue(visit.startDateTime ?? visit.startDatetime),
    active: !stopped,
    scheduled: Boolean(startDate && time(startDate) > now),
    retired: source.retired === true,
    canEdit: source.isEditAllowed !== false,
    canDiscontinue: source.isDiscontinuedAllowed !== false,
    raw: source,
  };
}

export function buildMedicationHistory(active: MedicationRecord[], prescribed: MedicationRecord[], locale: string, now = Date.now()): MedicationHistoryGroup[] {
  const recent = [...new Map(active.map((order) => [valueText(order.uuid), medicationHistoryOrder(order, now)])).values()]
    .sort((left, right) => Number(right.scheduled) - Number(left.scheduled) || time(right.startDate) - time(left.startDate));
  const byVisit = new Map<string, MedicationHistoryOrder[]>();
  prescribed.forEach((raw) => {
    const order = medicationHistoryOrder(raw, now);
    const visitDate = order.visitDate === undefined ? "sin-fecha" : String(order.visitDate);
    byVisit.set(visitDate, [...(byVisit.get(visitDate) ?? []), order]);
  });
  const visits = [...byVisit.entries()].sort((left, right) => time(right[0]) - time(left[0])).map(([visitDate, orders]) => ({
    id: `visit-${visitDate}`,
    label: formatMedicationDate(visitDate, locale) || "Sin fecha",
    recent: false,
    orders: [...orders].sort((left, right) => time(right.startDate) - time(left.startDate)),
  }));
  return [{ id: "recent", label: "Reciente", recent: true, orders: recent }, ...visits];
}

export function historyOrderToDraft(order: MedicationHistoryOrder, action: "NEW" | "REVISE" | "DISCONTINUE", clientId: string, today: string): ConsultationDrugOrder {
  const source = order.raw;
  const dosing = object(source.dosingInstructions);
  const administration = (() => { try { return object(JSON.parse(String(dosing.administrationInstructions ?? "{}"))); } catch { return {}; } })();
  const drug = object(source.drug);
  const concept = object(source.concept);
  const orderGroup = object(source.orderGroup);
  const base: ConsultationDrugOrder = {
    clientId,
    action,
    previousOrderUuid: action === "NEW" ? undefined : order.uuid,
    drug: typeof drug.uuid === "string" ? { ...drug, uuid: drug.uuid, name: valueText(drug.name), display: valueText(drug.display) } : undefined,
    drugNonCoded: valueText(source.drugNonCoded) || undefined,
    drugName: order.name,
    dose: numberValue(dosing.dose),
    doseUnits: valueText(dosing.doseUnits) || undefined,
    route: valueText(dosing.route) || undefined,
    frequency: valueText(dosing.frequency) || undefined,
    instructions: valueText(administration.instructions) || undefined,
    additionalInstructions: valueText(administration.additionalInstructions) || undefined,
    duration: numberValue(source.duration ?? dosing.duration),
    durationUnits: valueText(source.durationUnits ?? dosing.durationUnits) || undefined,
    quantity: numberValue(dosing.quantity),
    quantityUnits: valueText(dosing.quantityUnits) || undefined,
    asNeeded: dosing.asNeeded === true,
    careSetting: valueText(source.careSetting) || "OUTPATIENT",
    effectiveStartDate: action === "REVISE" ? today : dateOnly(order.stopDate, today) >= today ? dateOnly(order.stopDate, today) : today,
    orderSetUuid: valueText(object(orderGroup.orderSet).uuid) || undefined,
    orderGroupUuid: action === "REVISE" ? valueText(orderGroup.uuid) || undefined : undefined,
    dirty: true,
  };
  if (!base.drug && typeof concept.uuid === "string") base.drug = { ...concept, uuid: concept.uuid, name: valueText(concept.name), display: valueText(concept.display) };
  if (action === "DISCONTINUE") return { ...base, effectiveStartDate: dateOnly(order.startDate, today), dateStopped: today };
  return base;
}
