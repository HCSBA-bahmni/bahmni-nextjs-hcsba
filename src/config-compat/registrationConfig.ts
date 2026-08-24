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
export interface IdentifierMetadataConfig {
  typeCode: string;
  use: string;
  systemUri?: string;
  issuerCountryCode?: string;
  country?: boolean;
  countryRequired?: boolean;
  issuer?: boolean;
  issuerRequired?: boolean;
  documentType?: boolean;
  documentTypeRequired?: boolean;
  period?: boolean;
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
  showSecondLastName: boolean;
  showBirthTime: boolean;
  isLastNameMandatory: boolean;
  isSecondLastNameMandatory: boolean;
  patientNameDisplayOrder: string[];
  showEnterId: boolean;
  attributeNames: string[];
  attributeDefaults: Record<string, unknown>;
  hiddenAttributeNames: string[];
  mandatoryAttributeNames: string[];
  patientAttributeSections: PatientAttributeSectionConfig[];
  relationshipTypeMap: Record<string, "patient" | "provider">;
  patientSearch: {
    address: PatientSearchFieldConfig;
    customAttributes: PatientSearchFieldConfig;
    socialAttributes: PatientSearchFieldConfig;
  };
  fieldValidation: Record<string, { pattern?: string; errorMessage?: string }>;
  fieldHelpText: Record<string, string>;
  identifierHelpText: Record<string, string>;
  prominentExtraIdentifierTypes: string[];
  onDemandExtraIdentifierTypes: string[];
  hiddenExtraIdentifierTypes: string[];
  repeatableExtraIdentifierTypes: string[];
  identifierMetadata: Record<string, IdentifierMetadataConfig>;
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
  const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const stringRecord = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as JsonObject).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : []))
    : {};
  const rawIdentifierMetadata = config.identifierMetadata && typeof config.identifierMetadata === "object" && !Array.isArray(config.identifierMetadata)
    ? config.identifierMetadata as JsonObject
    : {};
  const identifierMetadata = Object.fromEntries(Object.entries(rawIdentifierMetadata).flatMap(([name, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const value = entry as JsonObject;
    if (typeof value.typeCode !== "string" || typeof value.use !== "string") return [];
    return [[name, {
      typeCode: value.typeCode,
      use: value.use,
      systemUri: typeof value.systemUri === "string" ? value.systemUri : undefined,
      issuerCountryCode: typeof value.issuerCountryCode === "string" ? value.issuerCountryCode : undefined,
      country: value.country === true,
      countryRequired: value.countryRequired === true,
      issuer: value.issuer === true,
      issuerRequired: value.issuerRequired === true,
      documentType: value.documentType === true,
      documentTypeRequired: value.documentTypeRequired === true,
      period: value.period === true,
    } satisfies IdentifierMetadataConfig]];
  }));
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
    showMiddleName: config.showMiddleName !== false, showLastName: config.showLastName !== false, showSecondLastName: config.showSecondLastName === true, showBirthTime: config.showBirthTime === true,
    isLastNameMandatory: config.isLastNameMandatory !== false,
    isSecondLastNameMandatory: config.isSecondLastNameMandatory === true,
    patientNameDisplayOrder: stringArray(config.patientNameDisplayOrder),
    showEnterId: config.showEnterID !== false,
    attributeNames,
    attributeDefaults: ((patientInformation.defaults ?? {}) as Record<string, unknown>),
    hiddenAttributeNames,
    mandatoryAttributeNames: stringArray(config.mandatoryPersonAttributes),
    patientAttributeSections,
    relationshipTypeMap: Object.fromEntries(Object.entries((config.relationshipTypeMap ?? {}) as JsonObject).flatMap(([name, value]) => value === "patient" || value === "provider" ? [[name, value]] : [])),
    patientSearch: {
      address: searchField(patientSearch.address),
      customAttributes: searchField(patientSearch.customAttributes),
      socialAttributes: searchField(patientSearch.socialAttributes),
    },
    fieldValidation: (config.fieldValidation ?? {}) as RegistrationConfig["fieldValidation"],
    fieldHelpText: stringRecord(config.fieldHelpText),
    identifierHelpText: stringRecord(config.identifierHelpText),
    prominentExtraIdentifierTypes: stringArray(config.prominentExtraIdentifierTypes),
    onDemandExtraIdentifierTypes: stringArray(config.onDemandExtraIdentifierTypes),
    hiddenExtraIdentifierTypes: stringArray(config.hiddenExtraIdentifierTypes),
    repeatableExtraIdentifierTypes: stringArray(config.repeatableExtraIdentifierTypes),
    identifierMetadata,
    printOptions,
    addressHierarchy: (config.addressHierarchy ?? {}) as RegistrationConfig["addressHierarchy"],
  };
}
