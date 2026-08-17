import type { OrderFulfillmentRecord } from "@/features/clinical/orderFulfillmentRecords";
import { normalizeOrderFulfillmentRecords } from "@/features/clinical/orderFulfillmentRecords";
import { getConceptByFullySpecifiedName } from "@/services/bahmni/consultation";
import { getDashboardOrders, getOrderTypes } from "@/services/bahmni/dashboard";
import { BahmniApiError, bahmniRequest } from "@/services/bahmni/http";
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

export interface ClinicalOrderObservation extends RecordValue {
  uuid?: string;
  orderUuid?: string;
  value?: unknown;
  comment?: string;
  voided?: boolean;
  concept?: RecordValue;
  groupMembers?: ClinicalOrderObservation[];
}

export interface OrderFulfillmentData { orderTypeUuid: string; formName: string; formConceptUuid: string; conceptNames: string[]; formMembers: FulfillmentFormMember[]; orders: OrderFulfillmentRecord[]; encounter: RecordValue }
const fulfillmentRepresentation = "custom:(uuid,name:(name,display),setMembers:(uuid,display,name:(name,display),datatype:(uuid,display,name),conceptClass:(uuid,display,name),units,answers:(uuid,display,name:(name,display)),setMembers:(uuid,display,name:(name,display),datatype:(uuid,display,name),conceptClass:(uuid,display,name),units,answers:(uuid,display,name:(name,display)))))";

export async function loadOrderFulfillment(patientUuid: string, orderType: string, locale: string, context?: { locationUuid?: string; providerUuid?: string }): Promise<OrderFulfillmentData> {
  const orderTypes = await getOrderTypes();
  const orderTypeUuid = resolveOrderTypeUuid(orderTypes, orderType);
  if (!orderTypeUuid) throw new Error(`Order type not configured: ${orderType}`);
  const formName = `${orderType} Fulfillment Form`;
  const formConcept = await getConceptByFullySpecifiedName(formName, fulfillmentRepresentation);
  const conceptNames = fulfillmentConceptNames(formConcept);
  const formMembers = fulfillmentFormMembers(formConcept);
  const [rawOrders, encounterResult] = await Promise.all([
    getDashboardOrders({ patientUuid, orderTypeUuid, conceptNames, includeObs: false }),
    context?.locationUuid ? findActiveOrderEncounter({ patientUuid, locationUuid: context.locationUuid, providerUuid: context.providerUuid }) : Promise.resolve({}),
  ]);
  const encounter: RecordValue = encounterResult;
  const formConceptUuid = text(formConcept?.uuid);
  if (!formConceptUuid) throw new Error(`Fulfillment form concept not configured: ${formName}`);
  const encounterObservations = records(encounter.observations) as ClinicalOrderObservation[];
  const orders = normalizeOrderFulfillmentRecords(rawOrders.map((order) => ({ ...order, bahmniObservations: encounterObservations.filter((observation) => text(observation.orderUuid) === text(order.orderUuid ?? order.uuid)) })), locale);
  return { orderTypeUuid, formName, formConceptUuid, conceptNames, formMembers, orders, encounter };
}

export interface OrderObservationInput { uuid?: string; concept: { uuid: string }; value?: string; comment?: string; groupMembers?: OrderObservationInput[]; orderUuid: string; voided?: boolean }

const conceptUuid = (observation: ClinicalOrderObservation): string | undefined => text(record(observation.concept).uuid);
const activeMembers = (observation?: ClinicalOrderObservation): ClinicalOrderObservation[] => records(observation?.groupMembers).filter((member) => member.voided !== true) as ClinicalOrderObservation[];

export function buildOrderObservation(params: { formConceptUuid: string; members: FulfillmentFormMember[]; orderUuid: string; textValues: Record<string, string>; fileValues: Record<string, Array<{ url: string; comment: string; uuid?: string }>>; existingObservations?: ClinicalOrderObservation[] }): OrderObservationInput | undefined {
  const existingRoot = params.existingObservations?.find((observation) => conceptUuid(observation) === params.formConceptUuid && observation.voided !== true);
  const mapMembers = (members: FulfillmentFormMember[], existingParent?: ClinicalOrderObservation): OrderObservationInput[] => members.flatMap<OrderObservationInput>((member) => {
    const existing = activeMembers(existingParent).filter((observation) => conceptUuid(observation) === member.uuid);
    if (member.children.length) {
      const current = existing[0];
      const children = mapMembers(member.children, current);
      return children.length ? [{ ...(text(current?.uuid) ? { uuid: text(current?.uuid) } : {}), concept: { uuid: member.uuid }, groupMembers: children, orderUuid: params.orderUuid }] : [];
    }
    const textValue = params.textValues[member.uuid]?.trim();
    if (member.datatype === "Text") {
      const current = existing[0];
      if (textValue) return [{ ...(text(current?.uuid) ? { uuid: text(current?.uuid) } : {}), concept: { uuid: member.uuid }, value: textValue, orderUuid: params.orderUuid }];
      return current?.uuid ? [{ uuid: current.uuid, concept: { uuid: member.uuid }, value: String(current.value ?? ""), orderUuid: params.orderUuid, voided: true }] : [];
    }
    const files = params.fileValues[member.uuid] ?? [];
    const retained = files.map((file) => ({ ...(file.uuid ? { uuid: file.uuid } : {}), concept: { uuid: member.uuid }, value: file.url, comment: file.comment.trim() || undefined, orderUuid: params.orderUuid }));
    const retainedUuids = new Set(files.flatMap((file) => file.uuid ? [file.uuid] : []));
    const removed = existing.filter((observation) => observation.uuid && !retainedUuids.has(observation.uuid)).map((observation) => ({ uuid: observation.uuid, concept: { uuid: member.uuid }, value: String(observation.value ?? ""), comment: text(observation.comment), orderUuid: params.orderUuid, voided: true }));
    return [...retained, ...removed];
  });
  const groupMembers = mapMembers(params.members, existingRoot);
  return groupMembers.length ? { ...(text(existingRoot?.uuid) ? { uuid: text(existingRoot?.uuid) } : {}), concept: { uuid: params.formConceptUuid }, groupMembers, orderUuid: params.orderUuid } : undefined;
}

export async function saveOrderObservations(params: { patientUuid: string; locationUuid: string; providerUuid?: string; observations: OrderObservationInput[] }): Promise<RecordValue> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter", { method: "POST", body: JSON.stringify({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providers: params.providerUuid ? [{ uuid: params.providerUuid }] : [], observations: params.observations, orders: [], drugOrders: [] }) });
}

export async function findActiveOrderEncounter(params: { patientUuid: string; locationUuid: string; providerUuid?: string }): Promise<RecordValue> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/bahmniencounter/find", { method: "POST", body: JSON.stringify({ patientUuid: params.patientUuid, providerUuids: params.providerUuid ? [params.providerUuid] : null, includeAll: true, locationUuid: params.locationUuid }) });
}

export interface FulfillmentDraftFile { dataUrl?: string; url?: string; uuid?: string; name: string; type: "image" | "pdf"; comment: string }
export interface FulfillmentDraft { text: Record<string, string>; files: Record<string, FulfillmentDraftFile[]>; changed?: boolean }

export function draftFromExistingObservations(members: FulfillmentFormMember[], observations: ClinicalOrderObservation[], formConceptUuid: string): FulfillmentDraft {
  const draft: FulfillmentDraft = { text: {}, files: {} };
  const root = observations.find((observation) => conceptUuid(observation) === formConceptUuid && observation.voided !== true);
  const visit = (configured: FulfillmentFormMember[], parent?: ClinicalOrderObservation) => configured.forEach((member) => {
    const existing = activeMembers(parent).filter((observation) => conceptUuid(observation) === member.uuid);
    if (member.children.length) return visit(member.children, existing[0]);
    if (member.datatype === "Text") draft.text[member.uuid] = String(existing[0]?.value ?? "");
    if (member.datatype === "Complex" && member.conceptClass === "Image") draft.files[member.uuid] = existing.flatMap((observation) => {
      const url = text(observation.value); if (!url) return [];
      return [{ url, uuid: text(observation.uuid), name: url.split("/").at(-1) ?? url, type: url.toLowerCase().endsWith(".pdf") ? "pdf" as const : "image" as const, comment: text(observation.comment) ?? "" }];
    });
  });
  visit(members, root);
  return draft;
}

interface FulfillmentPersistenceDependencies {
  upload: typeof uploadForm2ComplexFile;
  cleanup: typeof deleteUploadedComplexFile;
  findEncounter: typeof findActiveOrderEncounter;
  saveEncounter: typeof saveOrderObservations;
  writeAudit: typeof audit;
}

const persistenceDependencies: FulfillmentPersistenceDependencies = { upload: uploadForm2ComplexFile, cleanup: deleteUploadedComplexFile, findEncounter: findActiveOrderEncounter, saveEncounter: saveOrderObservations, writeAudit: audit };

const observationSignatures = (observations: unknown): string[] => records(observations).flatMap(function collect(observation): string[] {
  const children = records(observation.groupMembers).flatMap(collect);
  if (children.length) return children;
  const uuid = text(observation.uuid) ?? ""; const concept = text(record(observation.concept).uuid) ?? ""; const order = text(observation.orderUuid) ?? ""; const value = String(observation.value ?? ""); const voided = observation.voided === true ? "voided" : "active";
  return [`${uuid}|${concept}|${order}|${value}|${voided}`];
});
const complexConceptUuids = (members: FulfillmentFormMember[]): Set<string> => new Set(members.flatMap(function collect(member): string[] { return [...(member.datatype === "Complex" ? [member.uuid] : []), ...member.children.flatMap(collect)]; }));
const voidedComplexValues = (observations: unknown, complexConcepts: Set<string>): string[] => records(observations).flatMap(function collect(observation): string[] {
  const children = records(observation.groupMembers).flatMap(collect);
  const value = observation.voided === true && complexConcepts.has(text(record(observation.concept).uuid) ?? "") ? text(observation.value) : undefined;
  return [...children, ...(value ? [value] : [])];
});
const confirmedPreCommitFailure = (error: unknown): boolean => error instanceof BahmniApiError && error.status >= 400 && error.status < 500 && ![408, 409, 425, 429].includes(error.status);

async function reconcileAmbiguousSave(params: { patientUuid: string; locationUuid: string; providerUuid?: string; expectedObservations: OrderObservationInput[] }, dependencies: FulfillmentPersistenceDependencies): Promise<RecordValue | undefined> {
  const encounter = await dependencies.findEncounter({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid });
  const actual = new Set(observationSignatures(encounter.observations));
  const expected = observationSignatures(params.expectedObservations);
  const matches = expected.every((signature) => {
    const [, concept, order, value, voided] = signature.split("|");
    return [...actual].some((candidate) => { const [candidateUuid, candidateConcept, candidateOrder, candidateValue, candidateVoided] = candidate.split("|"); return candidateConcept === concept && candidateOrder === order && candidateValue === value && candidateVoided === voided && (voided !== "voided" || Boolean(candidateUuid)); });
  });
  return matches && text(encounter.encounterUuid ?? encounter.uuid) ? encounter : undefined;
}

export async function persistOrderFulfillment(params: { patientUuid: string; locationUuid: string; providerUuid?: string; orderType: string; formConceptUuid: string; members: FulfillmentFormMember[]; orders: OrderFulfillmentRecord[]; drafts: Record<string, FulfillmentDraft> }, dependencies: FulfillmentPersistenceDependencies = persistenceDependencies): Promise<RecordValue> {
  const hasContent = Object.values(params.drafts).some((draft) => draft.changed === true);
  if (!hasContent) throw new Error("Debe ingresar al menos un resultado antes de guardar.");
  // Existing observation UUIDs are required to update/void the legacy tree safely.
  // If OpenMRS cannot provide the current encounter, stop before uploading or saving;
  // treating that failure as an empty encounter could create duplicate observations.
  const previous: RecordValue = await dependencies.findEncounter({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid });
  const uploaded: string[] = [];
  let saveAttempted = false;
  let cleanupHandled = false;
  try {
    const observations: OrderObservationInput[] = [];
    for (const order of params.orders) {
      const draft = params.drafts[order.id]; if (!draft) continue;
      const fileValues: Record<string, Array<{ url: string; comment: string; uuid?: string }>> = {};
      for (const [conceptUuid, files] of Object.entries(draft.files)) {
        fileValues[conceptUuid] = [];
        for (const file of files) {
          if (file.url) { fileValues[conceptUuid].push({ url: file.url, comment: file.comment, uuid: file.uuid }); continue; }
          if (!file.dataUrl) throw new Error(`El archivo ${file.name} no contiene datos para subir.`);
          const url = await dependencies.upload({ dataUrl: file.dataUrl, patientUuid: params.patientUuid, fileType: file.type, fileName: file.name });
          uploaded.push(url); fileValues[conceptUuid].push({ url, comment: file.comment });
        }
      }
      const orderUuid = text(order.source.orderUuid ?? order.source.uuid);
      const observation = orderUuid ? buildOrderObservation({ formConceptUuid: params.formConceptUuid, members: params.members, orderUuid, textValues: draft.text, fileValues, existingObservations: order.observations as ClinicalOrderObservation[] }) : undefined;
      if (observation) observations.push(observation);
    }
    if (!observations.length) throw new Error("Las órdenes seleccionadas no tienen un UUID válido para guardar sus resultados.");
    let saved: RecordValue;
    try {
      saveAttempted = true;
      saved = await dependencies.saveEncounter({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid, observations });
      if (!text(saved.encounterUuid ?? saved.uuid)) saved = await reconcileAmbiguousSave({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid, expectedObservations: observations }, dependencies) ?? (() => { throw new Error("No fue posible reconciliar la respuesta ambigua del encuentro; no se eliminaron archivos automáticamente."); })();
    } catch (error) {
      if (confirmedPreCommitFailure(error)) { await Promise.allSettled(uploaded.map((filename) => dependencies.cleanup(filename))); cleanupHandled = true; throw error; }
      const reconciled = await reconcileAmbiguousSave({ patientUuid: params.patientUuid, locationUuid: params.locationUuid, providerUuid: params.providerUuid, expectedObservations: observations }, dependencies).catch(() => undefined);
      if (!reconciled) throw new Error("El resultado del guardado es incierto. Se conservan los archivos y no se reintentó la escritura.", { cause: error });
      saved = reconciled;
    }
    const encounterUuid = text(saved.encounterUuid ?? saved.uuid)!;
    const visitUuid = text(saved.visitUuid);
    if (!text(previous.visitUuid) && visitUuid) await dependencies.writeAudit("OPEN_VISIT", JSON.stringify({ visitUuid, visitType: text(saved.visitType) }), params.patientUuid, "MODULE_LABEL_ORDERS_KEY");
    await dependencies.writeAudit("EDIT_ENCOUNTER", JSON.stringify({ encounterUuid, encounterType: params.orderType }), params.patientUuid, "MODULE_LABEL_ORDERS_KEY");
    await Promise.allSettled(voidedComplexValues(observations, complexConceptUuids(params.members)).map((filename) => dependencies.cleanup(filename)));
    return saved;
  } catch (error) {
    if (uploaded.length && !saveAttempted && !cleanupHandled) await Promise.allSettled(uploaded.map((filename) => dependencies.cleanup(filename)));
    throw error;
  }
}
