export type FormTranslationMap = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

/**
 * Normaliza las variantes observadas en Bahmni Form Builder:
 * `[{ labels, concepts }]`, `{ labels, concepts }` y `{ es: { labels, concepts } }`.
 */
export function flattenFormTranslations(payload: unknown, locale?: string): FormTranslationMap {
  let candidate = parsePayload(payload);
  if (Array.isArray(candidate)) candidate = candidate[0];
  let record = asRecord(parsePayload(candidate));
  if (!record) return {};

  const normalizedLocale = locale?.replace("-", "_");
  const language = normalizedLocale?.split("_")[0];
  const localized = (normalizedLocale && record[normalizedLocale])
    ?? (locale && record[locale])
    ?? (language && record[language]);
  if (localized) record = asRecord(parsePayload(localized)) ?? record;

  const nested = record.translations ?? record.translation;
  if (nested) record = asRecord(parsePayload(nested)) ?? record;

  const labels = asRecord(record.labels) ?? {};
  const concepts = asRecord(record.concepts) ?? {};
  const direct = Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const grouped = Object.fromEntries([...Object.entries(labels), ...Object.entries(concepts)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return { ...direct, ...grouped };
}
