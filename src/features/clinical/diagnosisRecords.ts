export interface DashboardDiagnosis {
  key: string;
  name: string;
  certainty?: string;
  order?: string;
  status?: string;
  date?: string | number;
  comments?: string;
  provider?: string;
  ruledOut: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
};

const display = (value: unknown): string | undefined => {
  const record = asRecord(value);
  return text(record.name ?? record.display ?? record.shortName ?? record.value);
};

export function normalizeDashboardDiagnoses(
  source: Array<Record<string, unknown>>,
  showRuledOutDiagnoses = true,
): DashboardDiagnosis[] {
  return source.flatMap((item, index) => {
    const statusConcept = asRecord(item.diagnosisStatusConcept);
    const statusName = text(item.diagnosisStatus) ?? display(statusConcept);
    const ruledOut = /ruled\s*out|descartad/i.test(`${statusName ?? ""} ${display(statusConcept) ?? ""}`);
    if (!showRuledOutDiagnoses && ruledOut) return [];
    const providers = Array.isArray(item.providers) ? item.providers.map(asRecord) : [];
    const provider = display(providers[0]) ?? text(item.creatorName);
    const answer = asRecord(item.codedAnswer);
    const name = text(answer.name ?? answer.display ?? item.freeTextAnswer ?? item.display) ?? `Diagnóstico ${index + 1}`;
    const date = typeof item.diagnosisDateTime === "string" || typeof item.diagnosisDateTime === "number"
      ? item.diagnosisDateTime
      : typeof item.dateCreated === "string" || typeof item.dateCreated === "number" ? item.dateCreated : undefined;
    return [{
      key: text(item.existingObs ?? item.uuid ?? item.id) ?? `${name}-${index}`,
      name,
      certainty: text(item.certainty),
      order: text(item.order),
      status: statusName,
      date,
      comments: text(item.comments),
      provider,
      ruledOut,
    }];
  }).sort((left, right) => {
    const leftPrimary = left.order?.toUpperCase() === "PRIMARY" ? 0 : 1;
    const rightPrimary = right.order?.toUpperCase() === "PRIMARY" ? 0 : 1;
    return leftPrimary - rightPrimary;
  });
}
