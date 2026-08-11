import { toEncounterWireObservations } from "@/services/bahmni/visits";
import type {
  ClinicalConceptReference,
  ConsultationContextValue,
  ConsultationCondition,
  ConsultationDiagnosis,
  ConsultationDraft,
  ConsultationDrugOrder,
  ConsultationOrder,
  ConsultationSpecimen,
} from "./types";
import { specimenNeedsSave } from "./bacteriology";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const recordList = (value: unknown): Record<string, unknown>[] => {
  const list = records(value);
  if (list.length) return list;
  const single = object(value);
  return Object.keys(single).length ? [single] : [];
};
const id = (prefix: string, index: number) => `${prefix}-${index}`;
const string = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const dateOnly = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1];
    if (iso) return iso;
    const legacy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/u);
    if (legacy) return `${legacy[3]}-${legacy[2]}-${legacy[1]}`;
    if (!/^\d+$/u.test(value)) return undefined;
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
};

function concept(value: unknown): ClinicalConceptReference | undefined {
  const source = object(value);
  const uuid = string(source.uuid);
  if (!uuid) return undefined;
  const nameObject = object(source.name);
  return { ...source, uuid, name: string(source.name) ?? string(nameObject.name) ?? string(nameObject.display), display: string(source.display) };
}

function optionalConcept(value: unknown): { uuid?: string; name?: string; display?: string; [key: string]: unknown } | undefined {
  const source = object(value);
  if (!Object.keys(source).length) return undefined;
  const nameObject = object(source.name);
  const name = string(source.name) ?? string(nameObject.name) ?? string(nameObject.display);
  const uuid = string(source.uuid);
  if (!uuid && !name) return undefined;
  return { ...source, uuid, name, display: string(source.display) };
}

export function normalizeDiagnosis(value: Record<string, unknown>, index: number, encounterUuid?: string): ConsultationDiagnosis {
  const codedAnswer = concept(value.codedAnswer) ?? concept(value.concept);
  const sourceExistingObs = string(value.existingObs) ?? string(value.previousObs) ?? string(object(value.obs).uuid);
  const diagnosisEncounter = string(value.encounterUuid);
  const historical = Boolean(diagnosisEncounter && diagnosisEncounter !== encounterUuid);
  const firstDiagnosis = object(value.firstDiagnosis);
  return {
    clientId: id("diagnosis", index),
    uuid: string(value.uuid),
    existingObs: historical ? null : sourceExistingObs,
    previousObs: historical ? sourceExistingObs : string(value.previousObs),
    encounterUuid: diagnosisEncounter,
    codedAnswer,
    freeTextAnswer: string(value.freeTextAnswer) ?? string(value.diagnosisNonCoded),
    order: String(value.order ?? "SECONDARY").toUpperCase() === "PRIMARY" ? "PRIMARY" : "SECONDARY",
    certainty: String(value.certainty ?? "CONFIRMED").toUpperCase() === "PRESUMED" ? "PRESUMED" : "CONFIRMED",
    diagnosisStatusConcept: optionalConcept(value.diagnosisStatusConcept),
    comments: string(value.comments),
    diagnosisDateTime: typeof value.diagnosisDateTime === "string" || typeof value.diagnosisDateTime === "number" ? value.diagnosisDateTime : undefined,
    creatorName: string(value.creatorName),
    providers: records(value.providers).map((provider) => ({ ...provider, name: string(provider.name), display: string(provider.display) })),
    firstDiagnosis: Object.keys(firstDiagnosis).length ? normalizeDiagnosis(firstDiagnosis, index, encounterUuid) : undefined,
    voided: value.voided === true,
    dirty: false,
    historical,
  };
}

const conditionTimestamp = (value: unknown): number => {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function latestCondition(entry: Record<string, unknown>): { latest: Record<string, unknown>; activeSince?: string } {
  const history = records(entry.conditions).filter((condition) => condition.voided !== true);
  const latest = [...history].sort((left, right) => conditionTimestamp(left.onSetDate) - conditionTimestamp(right.onSetDate)).at(-1) ?? entry;
  const byUuid = new Map(history.flatMap((condition) => string(condition.uuid) ? [[string(condition.uuid)!, condition] as const] : []));
  let active = latest;
  const visited = new Set<string>();
  while (active.status !== "ACTIVE") {
    const previousUuid = string(active.previousConditionUuid);
    if (!previousUuid || visited.has(previousUuid)) break;
    visited.add(previousUuid);
    const previous = byUuid.get(previousUuid);
    if (!previous) break;
    active = previous;
  }
  return { latest, activeSince: string(active.onSetDate) ?? string(latest.onSetDate) };
}

export function normalizeConsultationConditions(conditions: Record<string, unknown>[]): ConsultationCondition[] {
  return conditions.flatMap((entry, index) => {
    const normalized = latestCondition(entry);
    const latest = normalized.latest;
    const creator = object(latest.creator);
    return [{
      clientId: id("condition", index), uuid: string(latest.uuid), concept: concept(latest.concept) ?? concept(entry.concept),
      conditionNonCoded: string(latest.conditionNonCoded) ?? string(entry.conditionNonCoded), status: string(latest.status) ?? "ACTIVE",
      onSetDate: string(latest.onSetDate), endDate: string(latest.endDate), endReason: string(latest.endReason),
      additionalDetail: string(latest.additionalDetail), activeSince: normalized.activeSince,
      creator: string(latest.creator) ?? string(creator.display) ?? string(creator.name), previousConditionUuid: string(latest.previousConditionUuid),
      voided: latest.voided === true, dirty: false, isFollowUp: latest.isFollowUp === true,
    }];
  });
}

function conditionUuids(value: unknown): string[] {
  return recordList(value).flatMap((entry) => {
    const history = records(entry.conditions);
    const candidates = history.length ? history : [entry];
    return candidates.flatMap((condition) => string(condition.uuid) ? [string(condition.uuid)!] : []);
  });
}

/**
 * Confirms the write using the local OpenMRS condition UUIDs returned by POST.
 * Terminology UUIDs cannot be compared here: OpenMRS maps the external SNOMED
 * identifier to its own concept UUID before exposing the condition history.
 */
export function conditionHistoryContainsSavedConditions(
  history: Record<string, unknown>[],
  savedConditions: Record<string, unknown>[],
): boolean {
  const savedActiveConditions = savedConditions.filter((condition) => condition.voided !== true);
  const expectedUuids = conditionUuids(savedActiveConditions);
  if (expectedUuids.length !== savedActiveConditions.length) return false;
  const persistedUuids = new Set(conditionUuids(history));
  return expectedUuids.every((uuid) => persistedUuids.has(uuid));
}

const normalizedConditionText = (value: string | undefined): string => value?.trim().toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "") ?? "";
const normalizedConditionDate = (value: string | null | undefined): string => value?.slice(0, 10) ?? "";
const conditionConceptMatches = (left: ConsultationCondition, right: ConsultationCondition): boolean => {
  const leftUuid = left.concept?.uuid?.replace(/\/+$/u, "");
  const rightUuid = right.concept?.uuid?.replace(/\/+$/u, "");
  if (leftUuid && rightUuid) {
    if (leftUuid === rightUuid) return true;
    const leftQualified = leftUuid.includes("/");
    const rightQualified = rightUuid.includes("/");
    if (leftQualified !== rightQualified && leftUuid.split("/").at(-1) === rightUuid.split("/").at(-1)) return true;
  }
  const leftName = normalizedConditionText(left.concept?.name ?? left.concept?.display);
  const rightName = normalizedConditionText(right.concept?.name ?? right.concept?.display);
  return Boolean(leftName && rightName && leftName === rightName);
};

function conditionMatches(left: ConsultationCondition, right: ConsultationCondition): boolean {
  const leftNonCoded = normalizedConditionText(left.conditionNonCoded);
  const rightNonCoded = normalizedConditionText(right.conditionNonCoded);
  if (leftNonCoded || rightNonCoded) return Boolean(leftNonCoded && rightNonCoded && leftNonCoded === rightNonCoded);
  return conditionConceptMatches(left, right);
}

/** Confirms the same read-after-write contract used by the legacy conditions service. */
export function conditionHistoryReflectsDraftChanges(persisted: ConsultationCondition[], draftConditions: ConsultationCondition[]): boolean {
  const changed = draftConditions.filter((condition) => condition.dirty);
  const expected = changed.length ? changed : draftConditions.filter((condition) => !condition.voided);
  return expected.every((condition) => {
    const saved = persisted.find((candidate) => !candidate.voided && conditionMatches(candidate, condition));
    if (condition.voided) return !saved;
    if (!saved || saved.status !== condition.status) return false;
    if (condition.onSetDate && normalizedConditionDate(saved.onSetDate) !== normalizedConditionDate(condition.onSetDate)) return false;
    if (condition.additionalDetail !== undefined && (saved.additionalDetail ?? "") !== condition.additionalDetail) return false;
    return true;
  });
}

export function createConsultationDraft(encounter: Record<string, unknown> = {}, diagnoses: Record<string, unknown>[] = [], conditions: Record<string, unknown>[] = []): ConsultationDraft {
  const encounterUuid = string(encounter.encounterUuid) ?? string(encounter.uuid);
  const encounterDiagnoses = records(encounter.bahmniDiagnoses);
  const extensions = object(encounter.extensions);
  const encounterOrders = records(encounter.orders).filter((order) => order.voided !== true && String(order.action ?? "").toUpperCase() !== "DISCONTINUE" && !order.dateStopped);
  const encounterDrugOrders = records(encounter.drugOrders).filter((order) => order.voided !== true && String(order.action ?? "").toUpperCase() !== "DISCONTINUE");
  const revisedPreviousOrderUuids = new Set(encounterDrugOrders.flatMap((order) => String(order.action ?? "").toUpperCase() === "REVISE" && typeof order.previousOrderUuid === "string" ? [order.previousOrderUuid] : []));
  return {
    encounterUuid,
    visitUuid: string(encounter.visitUuid) ?? string(object(encounter.visit).uuid),
    locationUuid: string(encounter.locationUuid) ?? string(object(encounter.location).uuid),
    encounterDateTime: string(encounter.encounterDateTime),
    providers: records(encounter.providers).flatMap((provider) => string(provider.uuid) ? [{ uuid: string(provider.uuid)! }] : []),
    diagnoses: (diagnoses.length ? diagnoses : encounterDiagnoses).map((entry, index) => normalizeDiagnosis(entry, index, encounterUuid)),
    conditions: normalizeConsultationConditions(conditions),
    followUpConditions: [],
    forms: {},
    disposition: Object.keys(object(encounter.disposition)).length ? {
      ...object(encounter.disposition),
      code: string(object(encounter.disposition).code),
      conceptName: string(object(encounter.disposition).conceptName),
      additionalObs: records(object(encounter.disposition).additionalObs),
    } : undefined,
    orders: encounterOrders.map((order, index) => normalizeOrder(order, index)),
    drugOrders: encounterDrugOrders.filter((order) => typeof order.uuid !== "string" || !revisedPreviousOrderUuids.has(order.uuid)).map((order, index) => normalizeDrugOrder(order, index)),
    specimens: records(extensions.mdrtbSpecimen).map((specimen, index) => normalizeSpecimen(specimen, index)),
    consultationNote: string(encounter.consultationNote),
    rawEncounter: encounter,
    dirtyBoards: [],
  };
}

function normalizeOrder(order: Record<string, unknown>, index: number): ConsultationOrder {
  return { clientId: id("order", index), ...order, uuid: string(order.uuid), concept: concept(order.concept) ?? { uuid: "", name: "" }, orderType: concept(order.orderType), dirty: false } as ConsultationOrder;
}

function normalizeDrugOrder(order: Record<string, unknown>, index: number): ConsultationDrugOrder {
  const dosing = object(order.dosingInstructions);
  const administration = (() => {
    const raw = string(dosing.administrationInstructions) ?? string(order.administrationInstructions);
    if (!raw) return {};
    try { return object(JSON.parse(raw)); } catch { return { instructions: raw }; }
  })();
  const orderGroup = object(order.orderGroup);
  return {
    clientId: id("drug", index), uuid: string(order.uuid), drug: concept(order.drug), drugNonCoded: string(order.drugNonCoded),
    drugName: string(object(order.drug).name) ?? string(order.drugNonCoded), dose: typeof dosing.dose === "number" ? dosing.dose : typeof order.dose === "number" ? order.dose : null,
    doseUnits: string(object(dosing.doseUnits).display) ?? string(dosing.doseUnits) ?? string(order.doseUnits), route: string(object(dosing.route).display) ?? string(dosing.route) ?? string(order.route),
    frequency: string(object(dosing.frequency).display) ?? string(dosing.frequency) ?? string(order.frequency),
    instructions: string(administration.instructions) ?? string(order.instructions), additionalInstructions: string(administration.additionalInstructions) ?? string(order.additionalInstructions),
    duration: typeof order.duration === "number" ? order.duration : typeof dosing.duration === "number" ? dosing.duration : null,
    durationUnits: string(object(order.durationUnits).display) ?? string(order.durationUnits) ?? string(object(dosing.durationUnits).display) ?? string(dosing.durationUnits),
    quantity: typeof dosing.quantity === "number" ? dosing.quantity : typeof order.quantity === "number" ? order.quantity : null,
    quantityUnits: string(object(dosing.quantityUnits).display) ?? string(dosing.quantityUnits) ?? string(order.quantityUnits), asNeeded: dosing.asNeeded === true || order.asNeeded === true,
    scheduledDate: string(order.scheduledDate), effectiveStartDate: string(order.effectiveStartDate), effectiveStopDate: string(order.effectiveStopDate), autoExpireDate: string(order.autoExpireDate), dateStopped: string(order.dateStopped),
    action: string(order.action) as ConsultationDrugOrder["action"], previousOrderUuid: string(order.previousOrderUuid), careSetting: string(object(order.careSetting).display) ?? string(order.careSetting),
    orderReasonConcept: concept(order.orderReasonConcept), orderReasonNonCoded: string(order.orderReasonText) ?? string(order.orderReasonNonCoded),
    orderGroupUuid: string(orderGroup.uuid), orderSetUuid: string(object(orderGroup.orderSet).uuid), dirty: false,
  };
}

function normalizeSpecimen(specimen: Record<string, unknown>, index: number): ConsultationSpecimen {
  return {
    clientId: id("specimen", index), uuid: string(specimen.uuid), dateCollected: dateOnly(specimen.dateCollected), type: concept(specimen.type),
    typeFreeText: string(specimen.typeFreeText), identifier: string(specimen.identifier),
    additionalAttributes: recordList(object(specimen.sample).additionalAttributes), results: recordList(object(specimen.report).results),
    voided: specimen.voided === true, dirty: false, raw: specimen,
  };
}

function diagnosisWire(diagnosis: ConsultationDiagnosis): Record<string, unknown> {
  const conceptSystem = diagnosis.codedAnswer?.conceptSystem ? `${diagnosis.codedAnswer.conceptSystem}/` : "";
  return {
    codedAnswer: { uuid: diagnosis.codedAnswer ? `${conceptSystem}${diagnosis.codedAnswer.uuid}` : undefined },
    freeTextAnswer: diagnosis.codedAnswer ? undefined : diagnosis.freeTextAnswer,
    order: diagnosis.order,
    certainty: diagnosis.certainty,
    existingObs: diagnosis.existingObs ?? null,
    diagnosisDateTime: null,
    diagnosisStatusConcept: diagnosis.diagnosisStatusConcept,
    voided: diagnosis.voided === true,
    comments: diagnosis.comments,
  };
}

export function hasDiagnosisAnswer(diagnosis: ConsultationDiagnosis): boolean {
  return Boolean(diagnosis.codedAnswer?.uuid || diagnosis.freeTextAnswer?.trim());
}

function orderWire(order: ConsultationOrder): Record<string, unknown> {
  const common = { concept: { uuid: order.concept.uuid, name: order.concept.name }, commentToFulfiller: order.commentToFulfiller, urgency: order.isUrgent ? "STAT" : order.urgency };
  if (order.action === "DISCONTINUE") return { ...common, action: "DISCONTINUE", previousOrderUuid: order.uuid ?? order.previousOrderUuid };
  if (order.action === "REVISE") return { ...common, action: "REVISE", previousOrderUuid: order.previousOrderUuid ?? order.uuid };
  return { uuid: order.uuid, ...common };
}

function conceptReferenceWire(value: unknown): { uuid: string; name?: string } | undefined {
  const source = object(value);
  const uuid = string(source.uuid);
  if (!uuid) return undefined;
  const nestedName = object(source.name);
  const name = string(source.name) ?? string(nestedName.name) ?? string(nestedName.display) ?? string(source.display);
  return { uuid, ...(name ? { name } : {}) };
}

function bacteriologyObservationWire(value: unknown): Record<string, unknown> | undefined {
  const source = object(value);
  if (!Object.keys(source).length) return undefined;
  const codedValue = object(source.value);
  const normalizedValue = string(codedValue.uuid) ? conceptReferenceWire(codedValue) : source.value;
  return {
    ...source,
    concept: conceptReferenceWire(source.concept),
    ...(Object.hasOwn(source, "value") ? { value: normalizedValue } : {}),
    ...(Object.hasOwn(source, "groupMembers") ? { groupMembers: recordList(source.groupMembers).map(bacteriologyObservationWire).filter((member): member is Record<string, unknown> => Boolean(member)) } : {}),
  };
}

function voidedBacteriologyObservationWire(value: unknown): Record<string, unknown> | undefined {
  const source = object(value);
  if (!string(source.uuid)) return undefined;
  return {
    ...source,
    concept: conceptReferenceWire(source.concept),
    value: undefined,
    voided: true,
    groupMembers: recordList(source.groupMembers)
      .map(voidedBacteriologyObservationWire)
      .filter((member): member is Record<string, unknown> => Boolean(member)),
  };
}

function drugWire(order: ConsultationDrugOrder): Record<string, unknown> {
  const nonCodedConcept = conceptReferenceWire(object(order).concept);
  return {
    uuid: order.uuid, action: order.action, previousOrderUuid: order.previousOrderUuid,
    careSetting: order.careSetting ?? "OUTPATIENT", orderType: "Drug Order",
    dosingInstructionType: "org.openmrs.module.bahmniemrapi.drugorder.dosinginstructions.FlexibleDosingInstructions",
    drug: order.drug ? { uuid: order.drug.uuid, name: order.drug.name } : undefined, drugNonCoded: order.drugNonCoded,
    ...(!order.drug && nonCodedConcept ? { concept: nonCodedConcept } : {}),
    dosingInstructions: {
      dose: order.dose, doseUnits: order.doseUnits, route: order.route, frequency: order.frequency, asNeeded: order.asNeeded === true,
      administrationInstructions: JSON.stringify({ instructions: order.instructions, additionalInstructions: order.additionalInstructions }),
      quantity: order.quantity, quantityUnits: order.quantityUnits ?? "Unit(s)", numberOfRefills: 0,
    },
    duration: order.duration, durationUnits: order.durationUnits, scheduledDate: order.scheduledDate ?? order.effectiveStartDate,
    autoExpireDate: order.autoExpireDate, effectiveStopDate: order.effectiveStopDate,
    orderReasonConcept: conceptReferenceWire(order.orderReasonConcept), orderReasonText: order.orderReasonNonCoded, dateStopped: order.dateStopped,
    orderGroup: { uuid: order.orderGroupUuid, orderSet: { uuid: order.orderSetUuid } },
  };
}

function specimenWire(specimen: ConsultationSpecimen): Record<string, unknown> {
  const raw = specimen.raw ?? {};
  const rawAdditionalAttributes = recordList(object(raw.sample).additionalAttributes);
  const rawResults = recordList(object(raw.report).results);
  const additionalAttributes = specimen.voided && !specimen.additionalAttributes?.length ? rawAdditionalAttributes : specimen.additionalAttributes ?? rawAdditionalAttributes;
  const results = specimen.voided && !specimen.results?.length ? rawResults : specimen.results ?? rawResults;
  const observationWire = specimen.voided ? voidedBacteriologyObservationWire : bacteriologyObservationWire;
  return {
    ...raw, dateCollected: specimen.dateCollected, uuid: specimen.uuid, identifier: specimen.identifier, type: conceptReferenceWire(specimen.type),
    voided: specimen.voided === true, typeFreeText: specimen.typeFreeText,
    // SpecimenMapper legacy filtra el arreglo y transmite el primer grupo de cada concept set.
    // ConceptMapper legacy convierte metadatos REST anidados a referencias de wire planas.
    sample: { ...object(raw.sample), additionalAttributes: observationWire(additionalAttributes[0]) },
    report: { ...object(raw.report), results: observationWire(results[0]) },
  };
}

export function buildConsultationEncounterPayload(draft: ConsultationDraft, context: ConsultationContextValue, encounterTypeUuid: string): Record<string, unknown> {
  const observations = Object.values(draft.forms).flatMap((form) => toEncounterWireObservations(form.observations));
  observations.push(...draft.followUpConditions);
  if (draft.consultationNote && draft.consultationNoteConcept) observations.push({ ...draft.consultationNoteObservation, concept: { uuid: draft.consultationNoteConcept.uuid, name: draft.consultationNoteConcept.name }, value: draft.consultationNote, groupMembers: [] });
  if (draft.labOrderNote && draft.labOrderNoteConcept) observations.push({ ...draft.labOrderNoteObservation, concept: { uuid: draft.labOrderNoteConcept.uuid, name: draft.labOrderNoteConcept.name }, value: draft.labOrderNote, groupMembers: [] });
  return {
    locationUuid: context.mode === "historical" ? draft.locationUuid ?? context.location.uuid : context.location.uuid,
    patientUuid: context.patientUuid,
    encounterUuid: draft.encounterUuid,
    visitUuid: draft.visitUuid ?? context.visit?.uuid,
    providers: draft.providers.length ? draft.providers : context.provider?.uuid ? [{ uuid: context.provider.uuid }] : [],
    encounterDateTime: context.retrospectiveDate ?? draft.encounterDateTime,
    encounterTypeUuid,
    extensions: { mdrtbSpecimen: draft.specimens.filter(specimenNeedsSave).map(specimenWire) },
    context: { patientProgramUuid: context.enrollmentUuid },
    ...(!draft.visitUuid && !context.visit?.uuid ? { visitType: context.mode === "retrospective" ? context.appConfig.visitTypeForRetrospectiveEntries : context.appConfig.defaultVisitType } : {}),
    bahmniDiagnoses: draft.diagnoses.filter((item) => item.dirty && hasDiagnosisAnswer(item)).map(diagnosisWire),
    orders: draft.orders.filter((item) => item.dirty || !item.uuid).map(orderWire),
    drugOrders: draft.drugOrders.filter((item) => item.dirty || !item.uuid).map(drugWire),
    disposition: draft.disposition,
    observations,
  };
}

export function markConsultationSaved(
  draft: ConsultationDraft,
  encounter: Record<string, unknown>,
  persistedConditions?: ConsultationCondition[],
  preserveConditionChanges = false,
): ConsultationDraft {
  const conditions = persistedConditions ?? draft.conditions;
  const next = createConsultationDraft(encounter, draft.diagnoses.map((entry) => entry as unknown as Record<string, unknown>), conditions.map((entry) => entry as unknown as Record<string, unknown>));
  const savedFollowUps = records(encounter.observations).filter((observation) => string(object(observation.concept).uuid) === draft.followUpConditionConcept?.uuid);
  const followUpConditions = savedFollowUps.length ? savedFollowUps : draft.followUpConditions;
  const followedConditionUuids = new Set(followUpConditions.flatMap((observation) => typeof observation.value === "string" ? [observation.value] : []));
  const savedObservations = records(encounter.observations);
  const consultationNoteObservation = savedObservations.find((observation) => string(object(observation.concept).uuid) === draft.consultationNoteConcept?.uuid) ?? draft.consultationNoteObservation;
  const labOrderNoteObservation = savedObservations.find((observation) => string(object(observation.concept).uuid) === draft.labOrderNoteConcept?.uuid) ?? draft.labOrderNoteObservation;
  return {
    ...next,
    conditions: (preserveConditionChanges ? draft.conditions : next.conditions).map((condition) => ({ ...condition, isFollowUp: Boolean(condition.uuid && followedConditionUuids.has(condition.uuid)) })),
    followUpConditions,
    followUpConditionConcept: draft.followUpConditionConcept,
    forms: draft.forms,
    consultationNote: draft.consultationNote,
    consultationNoteConcept: draft.consultationNoteConcept,
    consultationNoteObservation,
    labOrderNote: draft.labOrderNote,
    labOrderNoteConcept: draft.labOrderNoteConcept,
    labOrderNoteObservation,
    dirtyBoards: [],
  };
}

export function encounterReflectsDraftChanges(encounter: Record<string, unknown>, draft: ConsultationDraft): boolean {
  const serialized = JSON.stringify(encounter);
  const changedDiagnoses = draft.diagnoses.filter((item) => item.dirty && !item.voided && hasDiagnosisAnswer(item));
  const changedOrders = draft.orders.filter((item) => item.dirty && item.action !== "DISCONTINUE" && !item.voided);
  const changedDrugs = draft.drugOrders.filter((item) => item.dirty && item.action !== "DISCONTINUE");
  const changedForms = Object.values(draft.forms).flatMap((form) => form.observations);
  const readBackSpecimens = records(object(encounter.extensions).mdrtbSpecimen);
  const voidedSpecimens = draft.specimens.filter((item) => item.dirty && item.voided && item.uuid);
  const voidsConfirmed = voidedSpecimens.every((item) => !readBackSpecimens.some((candidate) => string(candidate.uuid) === item.uuid && candidate.voided !== true));
  if (!voidsConfirmed) return false;
  const markers = [
    ...changedDiagnoses.map((item) => item.codedAnswer?.uuid ?? item.freeTextAnswer),
    ...changedOrders.map((item) => item.concept.uuid),
    ...changedDrugs.map((item) => item.drug?.uuid ?? item.drugNonCoded),
    ...changedForms.map((item) => item.formFieldPath),
    ...draft.followUpConditions.filter((item) => item.voided !== true).map((item) => typeof item.value === "string" ? item.value : undefined),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (!markers.length) return Boolean(encounter.encounterUuid ?? encounter.uuid);
  return markers.every((marker) => serialized.includes(marker));
}
