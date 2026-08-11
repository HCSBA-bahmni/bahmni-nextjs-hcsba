export type LabRecord = Record<string, unknown>;

export interface LabPanel {
  kind: "panel";
  name: string;
  tests: LabRecord[];
}

export interface LabTest {
  kind: "test";
  test: LabRecord;
}

export interface LabAccession {
  uuid: string;
  date?: string | number;
  notes: LabRecord[];
  items: Array<LabPanel | LabTest>;
}

const numericTime = (value: unknown): number => {
  const time = typeof value === "number" ? value : typeof value === "string" ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const asRecords = (value: unknown): LabRecord[] => Array.isArray(value)
  ? value.filter((item): item is LabRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
  : [];

export function isAbnormalLabResult(test: LabRecord): boolean {
  if (test.abnormal === true) return true;
  const value = Number(test.result);
  const minimum = Number(test.minNormal);
  const maximum = Number(test.maxNormal);
  return Number.isFinite(value) && ((Number.isFinite(minimum) && value < minimum) || (Number.isFinite(maximum) && value > maximum));
}

export function normalRange(test: LabRecord): string {
  const minimum = typeof test.minNormal === "number" ? test.minNormal : undefined;
  const maximum = typeof test.maxNormal === "number" ? test.maxNormal : undefined;
  if (minimum !== undefined && maximum !== undefined) return `${minimum} – ${maximum}`;
  if (minimum !== undefined) return `> ${minimum}`;
  if (maximum !== undefined) return `< ${maximum}`;
  return "";
}

function groupItems(records: LabRecord[]): Array<LabPanel | LabTest> {
  const output: Array<LabPanel | LabTest> = [];
  const panelIndex = new Map<string, LabPanel>();
  records.forEach((test) => {
    const panelName = typeof test.preferredPanelName === "string" ? test.preferredPanelName : typeof test.panelName === "string" ? test.panelName : "";
    if (!panelName) {
      output.push({ kind: "test", test });
      return;
    }
    let panel = panelIndex.get(panelName);
    if (!panel) {
      panel = { kind: "panel", name: panelName, tests: [] };
      panelIndex.set(panelName, panel);
      output.push(panel);
    }
    panel.tests.push(test);
  });
  return output;
}

export function groupLabAccessions(results: LabRecord[], options: { initialAccessionCount?: number; latestAccessionCount?: number } = {}): LabAccession[] {
  const grouped = new Map<string, LabRecord[]>();
  results.forEach((result, index) => {
    const key = typeof result.accessionUuid === "string" ? result.accessionUuid : `accession-${index}`;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  });
  let accessions = [...grouped.entries()].map(([uuid, tests]) => ({
    uuid,
    date: tests[0]?.accessionDateTime as string | number | undefined,
    notes: asRecords(tests[0]?.accessionNotes),
    items: groupItems(tests),
  })).sort((left, right) => numericTime(left.date) - numericTime(right.date));
  const initial = Math.max(options.initialAccessionCount ?? 0, 0);
  const latest = Math.max(options.latestAccessionCount ?? 0, 0);
  if (initial || latest) {
    const selected = [...accessions.slice(0, initial), ...accessions.slice(Math.max(accessions.length - latest, initial))];
    accessions = selected.filter((item, index) => selected.findIndex((candidate) => candidate.uuid === item.uuid) === index);
  }
  return accessions.reverse();
}

export interface LabTabularModel {
  dates: LabRecord[];
  orders: LabRecord[];
  values: LabRecord[];
}

export function labTabularModel(root: LabRecord, sortLatestFirst: boolean): LabTabularModel {
  const tabular = root.tabularResult && typeof root.tabularResult === "object" && !Array.isArray(root.tabularResult) ? root.tabularResult as LabRecord : {};
  const values = asRecords(tabular.values);
  const usedDateIndexes = new Set(values.map((value) => value.dateIndex));
  const usedOrderIndexes = new Set(values.map((value) => value.testOrderIndex));
  const dates = asRecords(tabular.dates).filter((date) => !values.length || usedDateIndexes.has(date.index)).sort((left, right) => {
    const difference = numericTime(left.date) - numericTime(right.date);
    return sortLatestFirst ? -difference : difference;
  });
  const orders = asRecords(tabular.orders).filter((order) => !values.length || usedOrderIndexes.has(order.index));
  return { dates, orders, values };
}

export function labResultFor(model: LabTabularModel, dateIndex: unknown, testOrderIndex: unknown): LabRecord[] {
  return model.values.filter((value) => value.dateIndex === dateIndex && value.testOrderIndex === testOrderIndex);
}
