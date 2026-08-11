export interface LatestObservationItem { label: string; value: string }
export interface LatestObservationGroup { dateTime?: string | number; items: LatestObservationItem[] }

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  const record = asRecord(value);
  if (!record) return String(value);
  for (const key of ["displayString", "display", "name", "shortName", "value"]) {
    const candidate = record[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
    const nested = asRecord(candidate);
    if (nested) {
      const nestedDisplay = nested.display ?? nested.name;
      if (typeof nestedDisplay === "string") return nestedDisplay;
    }
  }
  return "—";
}

function conceptLabel(observation: RecordValue): string {
  const concept = asRecord(observation.concept);
  return display(concept?.shortName ?? concept?.name ?? concept?.displayString ?? observation.label ?? "Observación");
}

function observationDate(observation: RecordValue, inherited?: string | number): string | number | undefined {
  for (const key of ["observationDateTime", "obsDatetime", "encounterDateTime", "dateCreated"]) {
    const candidate = observation[key];
    if (typeof candidate === "string" || typeof candidate === "number") return candidate;
  }
  return inherited;
}

function flattenLatest(observations: RecordValue[], inheritedDate?: string | number): Array<{ dateTime?: string | number; label: string; value: string }> {
  return observations.flatMap((observation) => {
    if (observation.voided === true) return [];
    const dateTime = observationDate(observation, inheritedDate);
    const members = Array.isArray(observation.groupMembers) ? observation.groupMembers.map(asRecord).filter((item): item is RecordValue => Boolean(item)) : [];
    if (members.length) return flattenLatest(members, dateTime);
    return [{ dateTime, label: conceptLabel(observation), value: `${display(observation.value)}${typeof asRecord(observation.concept)?.units === "string" ? ` ${asRecord(observation.concept)?.units}` : ""}` }];
  });
}

export function groupLatestObservations(observations: RecordValue[], conceptNames: string[] = []): LatestObservationGroup[] {
  const accepted = new Set(conceptNames.map((name) => name.toLocaleLowerCase()));
  const grouped = new Map<string, LatestObservationGroup>();
  for (const item of flattenLatest(observations)) {
    if (accepted.size && !accepted.has(item.label.toLocaleLowerCase())) continue;
    const key = item.dateTime == null ? "unknown" : String(item.dateTime);
    const group = grouped.get(key) ?? { dateTime: item.dateTime, items: [] };
    group.items.push({ label: item.label, value: item.value });
    grouped.set(key, group);
  }
  return [...grouped.values()].sort((left, right) => {
    const leftTime = left.dateTime == null ? 0 : new Date(left.dateTime).getTime();
    const rightTime = right.dateTime == null ? 0 : new Date(right.dateTime).getTime();
    return rightTime - leftTime;
  });
}

export function formatLatestObservationDate(value?: string | number): string {
  if (value == null) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
