export type ProgramRecord = Record<string, unknown>;

export interface ProgramAttributeRow { name: string; value: string }
export interface ProgramStateRow { name: string; startDate?: string | number; endDate?: string | number }
export interface DashboardProgram {
  uuid: string;
  name: string;
  active: boolean;
  dateEnrolled?: string | number;
  dateCompleted?: string | number;
  outcome?: string;
  location?: string;
  attributes: ProgramAttributeRow[];
  states: ProgramStateRow[];
  raw: ProgramRecord;
}

const record = (value: unknown): ProgramRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ProgramRecord : {};
const records = (value: unknown): ProgramRecord[] => Array.isArray(value) ? value.filter((item): item is ProgramRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const text = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  const item = record(value);
  return text(item.shortName ?? item.display ?? item.name ?? item.value ?? item.uuid);
};
const instant = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizeDashboardPrograms(items: ProgramRecord[]): DashboardProgram[] {
  return items.filter((item) => item.retired !== true && item.voided !== true).map((item, index): DashboardProgram => {
    const program = record(item.program);
    const outcome = record(item.outcome);
    const attributes = records(item.attributes).flatMap((attribute): ProgramAttributeRow[] => {
      const attributeType = record(attribute.attributeType);
      const name = text(attributeType.description ?? attributeType.display ?? attributeType.name ?? attribute.name);
      const valueObject = record(attribute.value);
      const value = text(valueObject.shortName ?? valueObject.display ?? valueObject.name ?? attribute.value);
      return name && value ? [{ name, value }] : [];
    });
    const states = records(item.states).filter((state) => state.voided !== true).map((state): ProgramStateRow => {
      const stateDefinition = record(state.state);
      return {
        name: text(record(stateDefinition.concept).display ?? stateDefinition.display ?? stateDefinition.name) || "Estado",
        startDate: state.startDate as string | number | undefined,
        endDate: state.endDate as string | number | undefined,
      };
    }).sort((left, right) => instant(left.startDate) - instant(right.startDate));
    const dateCompleted = item.dateCompleted as string | number | undefined;
    return {
      uuid: text(item.uuid) || `program-${index}`,
      name: text(item.display ?? program.display ?? program.name) || "Programa",
      active: !dateCompleted,
      dateEnrolled: item.dateEnrolled as string | number | undefined,
      dateCompleted,
      outcome: text(outcome.display ?? outcome.name ?? item.outcome) || undefined,
      location: text(record(item.location).display ?? item.location) || undefined,
      attributes,
      states,
      raw: item,
    };
  }).sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return instant(right.active ? right.dateEnrolled : right.dateCompleted) - instant(left.active ? left.dateEnrolled : left.dateCompleted);
  });
}
