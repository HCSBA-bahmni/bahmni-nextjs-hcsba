export interface DashboardCondition extends Record<string, unknown> {
  display: string;
  status?: string;
  activeSince?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];

const timestamp = (value: unknown): number => {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function latestNonVoided(conditions: Record<string, unknown>[]) {
  return conditions
    .filter((condition) => condition.voided !== true)
    .sort((left, right) => timestamp(left.onSetDate) - timestamp(right.onSetDate))
    .at(-1);
}

function previousActiveCondition(
  condition: Record<string, unknown>,
  allConditions: Record<string, unknown>[],
  visited = new Set<string>(),
): Record<string, unknown> {
  if (condition.status === "ACTIVE") return condition;
  const previousUuid = typeof condition.previousConditionUuid === "string" ? condition.previousConditionUuid : undefined;
  if (!previousUuid || visited.has(previousUuid)) return condition;
  visited.add(previousUuid);
  const previous = allConditions.find((candidate) => candidate.uuid === previousUuid);
  return previous ? previousActiveCondition(previous, allConditions, visited) : condition;
}

/**
 * OpenMRS returns condition histories, not a flat condition list. This mirrors
 * Bahmni.Common.Domain.Conditions.fromConditionHistories and the dashboard
 * controller: select the newest non-voided state and retain the original
 * ACTIVE onset while the condition moves through its history.
 */
export function normalizeConditionHistories(
  histories: Record<string, unknown>[],
  includeInactive = false,
): DashboardCondition[] {
  return histories.flatMap((history) => {
    const allConditions = records(history.conditions);
    const latest = latestNonVoided(allConditions);
    if (!latest) return [];

    const status = typeof latest.status === "string" ? latest.status : undefined;
    if (!includeInactive && status !== "ACTIVE" && status !== "HISTORY_OF") return [];

    const concept = asRecord(latest.concept);
    const display = latest.conditionNonCoded
      ?? concept.shortName
      ?? concept.name
      ?? concept.display;
    if (typeof display !== "string" || !display.trim()) return [];

    const originalActive = previousActiveCondition(latest, allConditions);
    return [{
      ...latest,
      display,
      value: status,
      date: originalActive.onSetDate ?? latest.onSetDate,
      activeSince: originalActive.onSetDate ?? latest.onSetDate,
      notes: latest.additionalDetail,
    }];
  });
}
