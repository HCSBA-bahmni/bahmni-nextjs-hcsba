export type BacteriologyRecord = Record<string, unknown>;

export interface BacteriologySpecimen {
  uuid: string;
  source: string;
  identifier: string;
  collectedAt?: string | number;
  results: BacteriologyRecord[];
  raw: BacteriologyRecord;
}

const record = (value: unknown): BacteriologyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as BacteriologyRecord : {};
const records = (value: unknown): BacteriologyRecord[] => Array.isArray(value) ? value.map(record) : value && typeof value === "object" ? [record(value)] : [];
const text = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const item = record(value);
  return text(item.shortName ?? item.name ?? item.display ?? item.value ?? item.uuid);
};

export function mapBacteriologySpecimens(items: BacteriologyRecord[]): BacteriologySpecimen[] {
  return items.map((item, index) => {
    const type = record(item.type);
    const configuredSource = text(type.shortName ?? type.name);
    const source = configuredSource.toLocaleLowerCase() === "other sample" ? text(item.typeFreeText) : configuredSource;
    const report = record(item.report);
    return {
      uuid: text(item.uuid ?? item.existingObs) || `specimen-${index}`,
      source: source || "Muestra",
      identifier: text(item.identifier) || "—",
      collectedAt: item.dateCollected as string | number | undefined,
      results: records(report.results),
      raw: item,
    };
  });
}
