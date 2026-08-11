import type { Form2Definition, Form2Observation, Form2Values } from "@/features/forms/form2";
import type { BahmniLocation, BahmniProvider, BahmniUser, Visit } from "@/types/bahmni";

export const consultationBoardSlugs = ["observations", "diagnosis", "disposition", "summary", "orders", "bacteriology", "treatment"] as const;
export type ConsultationBoardSlug = typeof consultationBoardSlugs[number];
export type ConsultationMode = "active-visit" | "without-visit" | "historical" | "retrospective" | "program";

export interface ConsultationBoardConfig {
  id: string;
  slug: ConsultationBoardSlug;
  label: string;
  translationKey?: string;
  url: string;
  order: number;
  sourceIndex: number;
  default: boolean;
  requiredPrivilege?: string | string[];
  extensionParams: Record<string, unknown>;
}

export interface ConsultationFormConfig {
  id: string;
  formName: string;
  order: number;
  sourceIndex: number;
  default: boolean;
  alwaysShow: boolean;
  requiredPrivilege?: string | string[];
  visitTypes?: string[];
}

export interface ConsultationAppConfig {
  allowConsultationWhenNoOpenVisit: boolean;
  defaultVisitType: string;
  visitTypeForRetrospectiveEntries: string;
  allowOnlyCodedDiagnosis: boolean;
  hideConditions: boolean;
  diagnosisStatus: string;
  maxConceptSetLevels: number;
  quickPrints: boolean;
  allowAdhocTeleConsultation: boolean;
  teleConsultationDomain?: string;
  enableRadiologyOrderOptions: string[];
  enableLabOrderOptions: string[];
  orderTypeClassMap: Record<string, string[]>;
  otherInvestigationsMap: Record<string, string>;
  conceptSetUI: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface MedicationConfig {
  defaultDurationUnit: string;
  defaultInstructions: string;
  hideOrderSet: boolean;
  durationUnitsFactors: Array<{ name: string; factor: number }>;
  frequencyDefaultDurationUnitsMap: Array<{ minFrequency?: string | number | null; maxFrequency?: string | number | null; defaultDurationUnit: string }>;
  autopopulateDurationBasedOnFrequency: Array<{ frequencyName: string; duration: number; durationUnit: string }>;
  drugFormDefaults: Record<string, { doseUnits?: string; route?: string }>;
  calculateDoseOnlyOnCurrentVisitValues: boolean;
  raw: Record<string, unknown>;
}

export interface ClinicalConceptReference {
  uuid: string;
  name?: string;
  display?: string;
  conceptSystem?: string;
  dataType?: string;
  [key: string]: unknown;
}

export interface ConsultationDiagnosis {
  clientId: string;
  uuid?: string;
  existingObs?: string | null;
  previousObs?: string | null;
  encounterUuid?: string;
  codedAnswer?: ClinicalConceptReference;
  freeTextAnswer?: string;
  pendingAnswer?: string;
  order: "PRIMARY" | "SECONDARY";
  certainty: "CONFIRMED" | "PRESUMED";
  diagnosisStatusConcept?: { uuid?: string; name?: string; display?: string; [key: string]: unknown };
  comments?: string;
  diagnosisDateTime?: string | number;
  creatorName?: string;
  providers?: Array<{ name?: string; display?: string; [key: string]: unknown }>;
  firstDiagnosis?: ConsultationDiagnosis;
  voided?: boolean;
  dirty?: boolean;
  historical?: boolean;
}

export interface ConsultationCondition {
  clientId: string;
  uuid?: string;
  concept?: ClinicalConceptReference;
  conditionNonCoded?: string;
  status: "ACTIVE" | "INACTIVE" | string;
  onSetDate?: string | null;
  endDate?: string | null;
  endReason?: string;
  additionalDetail?: string;
  activeSince?: string | null;
  creator?: string;
  previousConditionUuid?: string;
  voided?: boolean;
  voidReason?: string;
  dirty?: boolean;
  isFollowUp?: boolean;
}

export interface ConsultationDisposition {
  code?: string;
  conceptName?: string;
  dispositionDateTime?: string;
  additionalObs: Array<Record<string, unknown>>;
  voided?: boolean;
  voidReason?: string;
}

export interface ConsultationOrder {
  clientId: string;
  uuid?: string;
  concept: ClinicalConceptReference;
  orderType?: ClinicalConceptReference;
  commentToFulfiller?: string;
  urgency?: "ROUTINE" | "STAT";
  isUrgent?: boolean;
  needsPrint?: boolean;
  action?: "NEW" | "REVISE" | "DISCONTINUE";
  previousOrderUuid?: string;
  voided?: boolean;
  dirty?: boolean;
}

export interface ConsultationDrugOrder {
  clientId: string;
  uuid?: string;
  drug?: ClinicalConceptReference;
  drugNonCoded?: string;
  drugName?: string;
  dose?: number | null;
  doseUnits?: string;
  route?: string;
  frequency?: string;
  frequencyPerDay?: number;
  instructions?: string;
  additionalInstructions?: string;
  duration?: number | null;
  durationUnits?: string;
  quantity?: number | null;
  quantityUnits?: string;
  asNeeded?: boolean;
  scheduledDate?: string;
  effectiveStartDate?: string;
  effectiveStopDate?: string;
  action?: "NEW" | "REVISE" | "DISCONTINUE";
  previousOrderUuid?: string;
  orderReasonNonCoded?: string;
  orderReasonConcept?: ClinicalConceptReference;
  careSetting?: string;
  autoExpireDate?: string;
  dateStopped?: string;
  orderSetUuid?: string;
  orderGroupUuid?: string;
  dosingRule?: string;
  dirty?: boolean;
}

export interface ConsultationSpecimen {
  clientId: string;
  uuid?: string;
  editing?: boolean;
  dateCollected?: string;
  type?: ClinicalConceptReference;
  typeFreeText?: string;
  identifier?: string;
  additionalAttributes?: Record<string, unknown>[];
  results?: Record<string, unknown>[];
  voided?: boolean;
  dirty?: boolean;
  raw?: Record<string, unknown>;
}

export interface ConsultationFormDraft {
  id: string;
  formName: string;
  formUuid: string;
  formVersion: string;
  definition: Form2Definition;
  observations: Form2Observation[];
  values?: Form2Values;
  valid: boolean;
  translations: Record<string, string>;
}

export interface ConsultationDraft {
  encounterUuid?: string;
  visitUuid?: string;
  locationUuid?: string;
  encounterDateTime?: string;
  providers: Array<{ uuid: string }>;
  diagnoses: ConsultationDiagnosis[];
  conditions: ConsultationCondition[];
  followUpConditions: Array<Record<string, unknown>>;
  followUpConditionConcept?: ClinicalConceptReference;
  forms: Record<string, ConsultationFormDraft>;
  disposition?: ConsultationDisposition;
  orders: ConsultationOrder[];
  drugOrders: ConsultationDrugOrder[];
  specimens: ConsultationSpecimen[];
  consultationNote?: string;
  consultationNoteConcept?: ClinicalConceptReference;
  consultationNoteObservation?: Record<string, unknown>;
  labOrderNote?: string;
  labOrderNoteConcept?: ClinicalConceptReference;
  labOrderNoteObservation?: Record<string, unknown>;
  rawEncounter?: Record<string, unknown>;
  dirtyBoards: ConsultationBoardSlug[];
}

export interface ConsultationContextValue {
  patientUuid: string;
  patient: { uuid: string; identifier?: string; name: string; gender?: string; age?: number; attributes?: Array<{ name: string; label: string; value: string }> };
  visit?: Visit;
  visits: Visit[];
  mode: ConsultationMode;
  configName: string;
  programUuid?: string;
  enrollmentUuid?: string;
  dateEnrolled?: string;
  dateCompleted?: string;
  retrospectiveDate?: string;
  user: BahmniUser;
  provider?: BahmniProvider | null;
  location: BahmniLocation;
  locale: string;
  timeZone: string;
  appConfig: ConsultationAppConfig;
  medicationConfig: MedicationConfig;
  boards: ConsultationBoardConfig[];
  forms: ConsultationFormConfig[];
}

export interface ConsultationBoardValidation {
  valid: boolean;
  message?: string;
  focusId?: string;
}

export interface ConsultationBoardAdapter {
  slug: ConsultationBoardSlug;
  validate(draft: ConsultationDraft, context: ConsultationContextValue): ConsultationBoardValidation;
  disabled?(context: ConsultationContextValue): boolean;
}

export interface ConsultationSaveResult {
  encounter: Record<string, unknown>;
  conditionsSaved: boolean;
  persistedConditions?: ConsultationCondition[];
  conditionsError?: unknown;
  reconciledAfterAmbiguousSave?: boolean;
}
