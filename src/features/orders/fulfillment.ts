import type { OrderFulfillmentRecord } from "@/features/clinical/orderFulfillmentRecords";
import { normalizeOrderFulfillmentRecords } from "@/features/clinical/orderFulfillmentRecords";
import { getConceptByFullySpecifiedName } from "@/services/bahmni/consultation";
import { getDashboardOrders, getOrderTypes } from "@/services/bahmni/dashboard";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

export function resolveOrderTypeUuid(orderTypes: Array<{ uuid: string; display?: string; name?: string }>, configuredName: string): string | undefined {
  return orderTypes.find((orderType) => (orderType.display ?? orderType.name) === configuredName)?.uuid;
}

export function fulfillmentConceptNames(concept: RecordValue | undefined): string[] {
  return records(concept?.setMembers).flatMap((member) => {
    const name = record(member.name);
    const value = text(name.name ?? name.display ?? member.display);
    return value ? [value] : [];
  });
}

export interface FulfillmentFormMember {
  uuid: string;
  label: string;
  datatype: string;
  conceptClass: string;
}

export function fulfillmentFormMembers(concept: RecordValue | undefined): FulfillmentFormMember[] {
  return records(concept?.setMembers).flatMap((member) => {
    const uuid = text(member.uuid); if (!uuid) return [];
    const name = record(member.name); const datatype = record(member.datatype); const conceptClass = record(member.conceptClass);
    return [{ uuid, label: text(name.display ?? name.name ?? member.display) ?? uuid, datatype: text(datatype.name ?? datatype.display) ?? "", conceptClass: text(conceptClass.name ?? conceptClass.display) ?? "" }];
  });
}

export interface OrderFulfillmentData { orderTypeUuid: string; formName: string; conceptNames: string[]; formMembers: FulfillmentFormMember[]; orders: OrderFulfillmentRecord[] }
const fulfillmentRepresentation = "custom:(uuid,name:(name,display),setMembers:(uuid,display,name:(name,display),datatype:(uuid,display,name),conceptClass:(uuid,display,name),units,answers:(uuid,display,name:(name,display)),setMembers:(uuid,display,name:(name,display),datatype:(uuid,display,name),conceptClass:(uuid,display,name),units,answers:(uuid,display,name:(name,display)))))";

export async function loadOrderFulfillment(patientUuid: string, orderType: string, locale: string): Promise<OrderFulfillmentData> {
  const orderTypes = await getOrderTypes();
  const orderTypeUuid = resolveOrderTypeUuid(orderTypes, orderType);
  if (!orderTypeUuid) throw new Error(`Order type not configured: ${orderType}`);
  const formName = `${orderType} Fulfillment Form`;
  const formConcept = await getConceptByFullySpecifiedName(formName, fulfillmentRepresentation);
  const conceptNames = fulfillmentConceptNames(formConcept);
  const formMembers = fulfillmentFormMembers(formConcept);
  const rawOrders = await getDashboardOrders({ patientUuid, orderTypeUuid, conceptNames, includeObs: false });
  return { orderTypeUuid, formName, conceptNames, formMembers, orders: normalizeOrderFulfillmentRecords(rawOrders, locale) };
}
