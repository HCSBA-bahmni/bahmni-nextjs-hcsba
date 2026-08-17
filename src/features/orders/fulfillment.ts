import type { OrderFulfillmentRecord } from "@/features/clinical/orderFulfillmentRecords";
import { normalizeOrderFulfillmentRecords } from "@/features/clinical/orderFulfillmentRecords";
import { getConceptByFullySpecifiedName } from "@/services/bahmni/consultation";
import { getDashboardOrders, getOrderTypes } from "@/services/bahmni/dashboard";
import { bahmniRequest } from "@/services/bahmni/http";
import { audit } from "@/services/bahmni/audit";
import { deleteUploadedComplexFile, uploadForm2ComplexFile } from "@/services/bahmni/forms";

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
  children: FulfillmentFormMember[];
}

function mapFormMember(member: RecordValue): FulfillmentFormMember | undefined {
  const uuid = text(member.uuid); if (!uuid) return undefined;
  const name = record(member.name); const datatype = record(member.datatype); const conceptClass = record(member.conceptClass);
  return { uuid, label: text(name.display ?? name.name ?? member.display) ?? uuid, datatype: text(datatype.name ?? datatype.display) ?? "", conceptClass: text(conceptClass.name ?? conceptClass.display) ?? "", children: records(member.setMembers).flatMap((child) => { const mapped = mapFormMember(child); return mapped ? [mapped] : []; }) };
}

export function fulfillmentFormMembers(concept: RecordValue | undefined): FulfillmentFormMember[] {
  return records(concept?.setMembers).flatMap((member) => { const mapped = mapFormMember(member); return mapped ? [mapped] : []; });
}

export interface OrderFulfillmentData { orderTypeUuid: string; formName: string; formConceptUuid: string; conceptNames: string[]; formMembers: FulfillmentFormMember[]; orders: OrderFulfillmentRecord[] }
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
  const formConceptUuid = text(formConcept?.uuid);
  if (!formConceptUuid) throw new Error(`Fulfillment form concept not configured: ${formName}`);
  return { orderTypeUuid, formName, formConceptUuid, conceptNames, formMembers, orders: normalizeOrderFulfillmentRecords(rawOrders, locale) };
}

export interface OrderObservationInput { concept: { uuid: string }; value?: string; comment?: string; groupMembers?: OrderObservationInput[]; orderUuid: string }

export function buildOrderObservation(params: { formConceptUuid: string; members: FulfillmentFormMember[]; orderUuid: string; textValues: Record<string, string>; fileValues: Record<string, Array<{ url: string; comment: string }>> }): OrderObservationInput | undefined {
  const mapMembers = (members: FulfillmentFormMember[]): OrderObservationInput[] => members.flatMap<OrderObservationInput>((member) => {
    const children = mapMembers(member.children);
    const textValue = params.textValues[member.uuid]?.trim();
    const files = params.fileValues[member.uuid] ?? [];
    if (member.children.length) return children.length ? [{ concept: { uuid: member.uuid }, groupMembers: children, orderUuid: params.orderUuid }] : [];
    if (member.datatype === "Text" && textValue) return [{ concept: { uuid: member.uuid }, value: textValue, orderUuid: params.orderUuid }];
    return files.map((file) => ({ concept: { uuid: member.uuid }, value: file.url, comment: file.comment.trim() || undefined, orderUuid: params.orderUuid }));
  });
  const groupMembers = mapMembers(params.members);
  return groupMembers.length ? { concept: { uuid: params.formConceptUuid }, groupMembers, orderUuid: params.orderUuid } : undefined;
}

export async function saveOrderObservations(params: { patientUuid: string; locationUuid: string; observations: OrderObservationInput[] }): Promise<RecordValue> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", { method: "POST", body: JSON.stringify({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, observations: params.observations, orders: [], drugOrders: [] }) });
}

export async function findActiveOrderEncounter(params: { patientUuid: string; locationUuid: string; providerUuid?: string }): Promise<RecordValue> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter/find", { method: "POST", body: JSON.stringify({ patientUuid: params.patientUuid, providerUuids: params.providerUuid ? [params.providerUuid] : null, includeAll: true, locationUuid: params.locationUuid }) });
}

export interface FulfillmentDraftFile { dataUrl: string; name: string; type: "image" | "pdf"; comment: string }
export interface FulfillmentDraft { text: Record<string, string>; files: Record<string, FulfillmentDraftFile[]> }

interface FulfillmentPersistenceDependencies {
  upload: typeof uploadForm2ComplexFile;
  cleanup: typeof deleteUploadedComplexFile;
  findEncounter: typeof findActiveOrderEncounter;
  saveEncounter: typeof saveOrderObservations;
  writeAudit: typeof audit;
}

const persistenceDependencies: FulfillmentPersistenceDependencies = { upload: uploadForm2ComplexFile, cleanup: deleteUploadedComplexFile, findEncounter: findActiveOrderEncounter, saveEncounter: saveOrderObservations, writeAudit: audit };

export async function persistOrderFulfillment(params: { patientUuid: string; locationUuid: string; providerUuid?: string; orderType: string; formConceptUuid: string; members: FulfillmentFormMember[]; orders: OrderFulfillmentRecord[]; drafts: Record<string, FulfillmentDraft> }, dependencies: FulfillmentPersistenceDependencies = persistenceDependencies): Promise<RecordValue> {
  const hasContent = Object.values(params.drafts).some((draft) => Object.values(draft.text).some((value) => Boolean(value.trim())) || Object.values(draft.files).some((files) => files.length > 0));
  if (!hasContent) throw new Error("Debe ingresar al menos un resultado antes de guardar.");
  const previous: RecordValue = await dependencies.findEncounter({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid }).catch(() => ({}));
  const uploaded: string[] = [];
  let encounterPersisted = false;
  try {
    const observations: OrderObservationInput[] = [];
    for (const order of params.orders) {
      const draft = params.drafts[order.id]; if (!draft) continue;
      const fileValues: Record<string, Array<{ url: string; comment: string }>> = {};
      for (const [conceptUuid, files] of Object.entries(draft.files)) {
        fileValues[conceptUuid] = [];
        for (const file of files) {
          const url = await dependencies.upload({ dataUrl: file.dataUrl, patientUuid: params.patientUuid, fileType: file.type, fileName: file.name });
          uploaded.push(url); fileValues[conceptUuid].push({ url, comment: file.comment });
        }
      }
      const orderUuid = text(order.source.orderUuid ?? order.source.uuid);
      const observation = orderUuid ? buildOrderObservation({ formConceptUuid: params.formConceptUuid, members: params.members, orderUuid, textValues: draft.text, fileValues }) : undefined;
      if (observation) observations.push(observation);
    }
    if (!observations.length) throw new Error("Las órdenes seleccionadas no tienen un UUID válido para guardar sus resultados.");
    const saved = await dependencies.saveEncounter({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, observations });
    const encounterUuid = text(saved.encounterUuid ?? saved.uuid);
    if (!encounterUuid) throw new Error("El servidor no confirmó el UUID del encuentro guardado.");
    encounterPersisted = true;
    const visitUuid = text(saved.visitUuid);
    if (!text(previous.visitUuid) && visitUuid) await dependencies.writeAudit("OPEN_VISIT", JSON.stringify({ visitUuid, visitType: text(saved.visitType) }), params.patientUuid, "MODULE_LABEL_ORDERS_KEY");
    await dependencies.writeAudit("EDIT_ENCOUNTER", JSON.stringify({ encounterUuid, encounterType: params.orderType }), params.patientUuid, "MODULE_LABEL_ORDERS_KEY");
    return saved;
  } catch (error) {
    if (!encounterPersisted) await Promise.allSettled(uploaded.map((filename) => dependencies.cleanup(filename)));
    throw error;
  }
}
