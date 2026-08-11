import type { JsonObject } from "./merge";

export interface RegistrationPrintOption { label: string; translationKey?: string; templateUrl: string; shortcutKey?: string }
export interface PatientSearchFieldConfig { label?: string; placeholder?: string; field?: string; fields: string[] }
export interface VisitForwardConfig { visitType: string; forwardUrl: string; translationKey?: string; shortcutKey?: string }
export interface PatientAttributeSectionConfig {
  key: string;
  title?: string;
  translationKey?: string;
  shortcutKey?: string;
  order: number;
  expanded: boolean;
  attributes: string[];
}
export interface RegistrationConfig {
  defaultIdentifierPrefix?: string;
  defaultVisitType?: string;
  searchByIdForwardUrl?: string;
  dashboardUrl?: string;
  afterVisitSaveForwardUrl?: string;
  showStartVisitButton: boolean;
  showSuccessMessage: boolean;
  enableDashboardRedirect: boolean;
  forwardUrlsForVisitTypes: VisitForwardConfig[];
  showMiddleName: boolean;
  showLastName: boolean;
  showBirthTime: boolean;
  isLastNameMandatory: boolean;
  showEnterId: boolean;
  attributeNames: string[];
  attributeDefaults: Record<string, unknown>;
  hiddenAttributeNames: string[];
  patientAttributeSections: PatientAttributeSectionConfig[];
  relationshipTypeMap: Record<string, "patient" | "provider">;
  patientSearch: {
    address: PatientSearchFieldConfig;
    customAttributes: PatientSearchFieldConfig;
    socialAttributes: PatientSearchFieldConfig;
  };
  fieldValidation: Record<string, { pattern?: string; errorMessage?: string }>;
  printOptions: RegistrationPrintOption[];
  addressHierarchy: { showAddressFieldsTopDown?: boolean; strictAutocompleteFromLevel?: string };
}

export function parseRegistrationConfig(descriptor: JsonObject): RegistrationConfig {
  const config = (descriptor.config ?? {}) as JsonObject;
  const patientInformation = (config.patientInformation ?? {}) as JsonObject;
  const hidden = (patientInformation.hidden ?? {}) as JsonObject;
  const hiddenAttributeNames = Array.isArray(hidden.attributes) ? hidden.attributes.filter((item): item is string => typeof item === "string") : [];
  const patientAttributeSections = Object.entries(patientInformation).flatMap(([key, entry], index): PatientAttributeSectionConfig[] => {
    if (["hidden", "defaults"].includes(key) || !entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const section = entry as JsonObject;
    const attributes = Array.isArray(section.attributes) ? section.attributes.filter((item): item is string => typeof item === "string") : [];
    if (!attributes.length) return [];
    return [{
      key,
      title: typeof section.title === "string" ? section.title : undefined,
      translationKey: typeof section.translationKey === "string" ? section.translationKey : undefined,
      shortcutKey: typeof section.shortcutKey === "string" ? section.shortcutKey : undefined,
      order: typeof section.order === "number" ? section.order : index,
      expanded: section.expanded === true,
      attributes,
    }];
  }).sort((left, right) => left.order - right.order);
  const attributeNames = [...new Set(patientAttributeSections.flatMap((section) => section.attributes))];
  const patientSearch = (config.patientSearch ?? {}) as JsonObject;
  const searchField = (value: unknown): PatientSearchFieldConfig => {
    const field = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
    return {
      label: typeof field.label === "string" ? field.label : undefined,
      placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
      field: typeof field.field === "string" ? field.field : undefined,
      fields: Array.isArray(field.fields) ? field.fields.filter((item): item is string => typeof item === "string") : [],
    };
  };
  const rawOptions = Array.isArray(config.printOptions) ? config.printOptions : [];
  const printOptions = rawOptions.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const value = option as JsonObject;
    return typeof value.templateUrl === "string" ? [{ label: String(value.label ?? value.translationKey ?? value.templateUrl), translationKey: typeof value.translationKey === "string" ? value.translationKey : undefined, templateUrl: value.templateUrl, shortcutKey: typeof value.shortcutKey === "string" ? value.shortcutKey : undefined }] : [];
  });
  const forwardUrlsForVisitTypes = (Array.isArray(config.forwardUrlsForVisitTypes) ? config.forwardUrlsForVisitTypes : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const value = entry as JsonObject;
    if (typeof value.visitType !== "string" || typeof value.forwardUrl !== "string") return [];
    return [{
      visitType: value.visitType,
      forwardUrl: value.forwardUrl,
      translationKey: typeof value.translationKey === "string" ? value.translationKey : undefined,
      shortcutKey: typeof value.shortcutKey === "string" ? value.shortcutKey : undefined,
    }];
  });
  return {
    defaultIdentifierPrefix: typeof config.defaultIdentifierPrefix === "string" ? config.defaultIdentifierPrefix : undefined,
    defaultVisitType: typeof config.defaultVisitType === "string" ? config.defaultVisitType : undefined,
    searchByIdForwardUrl: typeof config.searchByIdForwardUrl === "string" ? config.searchByIdForwardUrl : undefined,
    dashboardUrl: typeof config.dashboardUrl === "string" ? config.dashboardUrl : undefined,
    afterVisitSaveForwardUrl: typeof config.afterVisitSaveForwardUrl === "string" ? config.afterVisitSaveForwardUrl : undefined,
    showStartVisitButton: config.showStartVisitButton !== false,
    showSuccessMessage: config.showSuccessMessage === true,
    enableDashboardRedirect: config.enableDashboardRedirect === true,
    forwardUrlsForVisitTypes,
    showMiddleName: config.showMiddleName !== false, showLastName: config.showLastName !== false, showBirthTime: config.showBirthTime === true,
    isLastNameMandatory: config.isLastNameMandatory !== false,
    showEnterId: config.showEnterID !== false,
    attributeNames,
    attributeDefaults: ((patientInformation.defaults ?? {}) as Record<string, unknown>),
    hiddenAttributeNames,
    patientAttributeSections,
    relationshipTypeMap: Object.fromEntries(Object.entries((config.relationshipTypeMap ?? {}) as JsonObject).flatMap(([name, value]) => value === "patient" || value === "provider" ? [[name, value]] : [])),
    patientSearch: {
      address: searchField(patientSearch.address),
      customAttributes: searchField(patientSearch.customAttributes),
      socialAttributes: searchField(patientSearch.socialAttributes),
    },
    fieldValidation: (config.fieldValidation ?? {}) as RegistrationConfig["fieldValidation"],
    printOptions,
    addressHierarchy: (config.addressHierarchy ?? {}) as RegistrationConfig["addressHierarchy"],
  };
}
