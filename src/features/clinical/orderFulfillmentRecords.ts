import type { DashboardRecord } from "@/services/bahmni/dashboard";

export interface OrderFulfillmentRecord {
  id: string;
  label: string;
  orderDate?: string | number;
  provider?: string;
  observations: DashboardRecord[];
  hasObservations: boolean;
  source: DashboardRecord;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): DashboardRecord[] => Array.isArray(value)
  ? value.filter((item): item is DashboardRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
  : [];
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : undefined;

function localeMatches(candidate: unknown, locale: string): boolean {
  const normalizedCandidate = text(candidate)?.toLowerCase().replace("_", "-");
  const normalizedLocale = locale.toLowerCase().replace("_", "-");
  return Boolean(normalizedCandidate && (normalizedCandidate === normalizedLocale || normalizedCandidate.split("-")[0] === normalizedLocale.split("-")[0]));
}

export function orderConceptLabel(source: DashboardRecord, locale: string): string {
  // Legacy renders `order.concept`, while the generic dashboard table used
  // `conceptName`. Both values may intentionally differ when the concept has
  // a short name or a locale-specific display.
  if (text(source.concept)) return text(source.concept)!;
  const concept = record(source.concept);
  const localizedName = records(concept.names).find((name) => localeMatches(name.locale, locale));
  return text(localizedName?.display ?? localizedName?.name)
    ?? text(concept.shortName ?? concept.name ?? concept.display)
    ?? text(source.conceptName ?? source.orderName ?? source.display)
    ?? "Orden sin nombre";
}

export function normalizeOrderFulfillmentRecords(source: DashboardRecord[], locale: string): OrderFulfillmentRecord[] {
  return source.map((order, index) => {
    const observations = records(order.bahmniObservations);
    const provider = record(order.provider);
    const orderer = record(order.orderer);
    return {
      id: text(order.uuid ?? order.orderUuid ?? order.orderNumber) ?? `order-${index}`,
      label: orderConceptLabel(order, locale),
      orderDate: typeof order.orderDate === "string" || typeof order.orderDate === "number" ? order.orderDate : undefined,
      provider: text(order.provider)
        ?? text(provider.display ?? provider.name)
        ?? text(record(orderer.person).display ?? orderer.display)
        ?? text(order.providerName),
      observations,
      hasObservations: observations.length > 0 || order.hasObservations === true,
      source: order,
    };
  });
}
