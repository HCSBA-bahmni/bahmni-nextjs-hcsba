import type { AppExtension, BahmniUser, PatientSearchResult } from "@/types/bahmni";
import { hasPrivilege } from "@/services/bahmni/auth";

const patientSearchExtensionPoint = "org.bahmni.patient.search";

export interface OrdersPatientSearchTab {
  id: string;
  label: string;
  translationKey?: string;
  handler: string;
  additionalParams?: string;
  searchColumns: string[];
  orderType: string;
  order: number;
}

const optionalString = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;

function orderTypeFromForwardUrl(value: unknown): string | undefined {
  const url = optionalString(value);
  if (!url) return undefined;
  const match = url.match(/\/fulfillment\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function parseOrdersPatientSearchTabs(extensions: AppExtension[], user: BahmniUser | null): OrdersPatientSearchTab[] {
  return extensions
    .filter((extension) => extension.extensionPointId === patientSearchExtensionPoint && extension.type === "config")
    .filter((extension) => hasPrivilege(user, extension.requiredPrivilege))
    .flatMap((extension) => {
      const params = extension.extensionParams && typeof extension.extensionParams === "object" && !Array.isArray(extension.extensionParams)
        ? extension.extensionParams as Record<string, unknown>
        : {};
      const handler = optionalString(params.searchHandler);
      const orderType = orderTypeFromForwardUrl(params.forwardUrl);
      if (!handler || !orderType) return [];
      const configuredColumns = Array.isArray(params.searchColumns) ? params.searchColumns.filter((item): item is string => typeof item === "string") : [];
      return [{
        id: extension.id,
        label: optionalString(params.display) ?? optionalString(extension.label) ?? extension.id,
        translationKey: optionalString(params.translationKey) ?? optionalString(extension.translationKey),
        handler,
        additionalParams: optionalString(params.additionalParams),
        searchColumns: configuredColumns.length ? configuredColumns : ["identifier", "name"],
        orderType,
        order: extension.order ?? 0,
      }];
    })
    .sort((left, right) => left.order - right.order);
}

export function ordersPatientDestination(tab: OrdersPatientSearchTab, patient: PatientSearchResult): string {
  return `/orders/patient/${encodeURIComponent(patient.uuid)}/fulfillment/${encodeURIComponent(tab.orderType)}`;
}
