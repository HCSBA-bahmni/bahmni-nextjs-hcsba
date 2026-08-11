import type { AppExtension } from "@/types/bahmni";
import type { ConsultationAppConfig, ConsultationBoardConfig, ConsultationBoardSlug, ConsultationFormConfig, MedicationConfig } from "./types";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function boardSlug(extension: AppExtension): ConsultationBoardSlug | undefined {
  const url = String(extension.url ?? "").replace(/^\/+|\/+$/g, "");
  if (url.startsWith("concept-set-group/")) return "observations";
  if (url === "consultation") return "summary";
  if (["diagnosis", "disposition", "orders", "bacteriology", "treatment"].includes(url)) return url as ConsultationBoardSlug;
  return undefined;
}

export function parseConsultationBoards(extensions: AppExtension[]): ConsultationBoardConfig[] {
  return extensions.flatMap((extension, sourceIndex) => {
    if (extension.extensionPointId !== "org.bahmni.clinical.consultation.board") return [];
    const slug = boardSlug(extension);
    if (!slug) return [];
    return [{
      id: extension.id,
      slug,
      label: typeof extension.label === "string" ? extension.label : slug,
      translationKey: typeof extension.translationKey === "string" ? extension.translationKey : undefined,
      url: String(extension.url ?? slug),
      order: typeof extension.order === "number" ? extension.order : Number.MAX_SAFE_INTEGER,
      sourceIndex,
      default: extension.default === true,
      requiredPrivilege: extension.requiredPrivilege,
      extensionParams: object(extension.extensionParams),
    }];
  }).sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex);
}

export function consultationBoardsForPrivileges(boards: ConsultationBoardConfig[], privilegeNames: Iterable<string>): ConsultationBoardConfig[] {
  const privileges = new Set(privilegeNames);
  return boards.filter((board) => {
    if (!board.requiredPrivilege) return true;
    const required = Array.isArray(board.requiredPrivilege) ? board.requiredPrivilege : [board.requiredPrivilege];
    return required.every((privilege) => privileges.has(privilege));
  });
}

function visitTypesFromShowIf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const source = value.filter((item): item is string => typeof item === "string").join("\n");
  const literal = source.match(/visitTypes\s*=\s*\[([^\]]*)\]/)?.[1];
  if (literal === undefined) return undefined;
  return [...literal.matchAll(/["']([^"']+)["']/g)].flatMap((match) => match[1] ? [match[1]] : []);
}

export function parseConsultationForms(extensions: AppExtension[]): ConsultationFormConfig[] {
  return extensions.flatMap((extension, sourceIndex) => {
    if (extension.extensionPointId !== "org.bahmni.clinical.conceptSetGroup.observations") return [];
    const params = object(extension.extensionParams);
    if (typeof params.formName !== "string") return [];
    return [{
      id: extension.id,
      formName: params.formName,
      order: typeof extension.order === "number" ? extension.order : Number.MAX_SAFE_INTEGER,
      sourceIndex,
      default: params.default === true,
      alwaysShow: params.alwaysShow === true,
      requiredPrivilege: extension.requiredPrivilege,
      visitTypes: visitTypesFromShowIf(params.showIf),
    }];
  }).sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex);
}

export function parseConsultationAppConfig(source: Record<string, unknown>): ConsultationAppConfig {
  const config = object(source.config);
  return {
    allowConsultationWhenNoOpenVisit: config.allowConsultationWhenNoOpenVisit === true,
    defaultVisitType: typeof config.defaultVisitType === "string" ? config.defaultVisitType : "OPD",
    visitTypeForRetrospectiveEntries: typeof config.visitTypeForRetrospectiveEntries === "string" ? config.visitTypeForRetrospectiveEntries : "OPD",
    allowOnlyCodedDiagnosis: config.allowOnlyCodedDiagnosis === true,
    hideConditions: config.hideConditions === true,
    diagnosisStatus: typeof config.diagnosisStatus === "string" ? config.diagnosisStatus : "RULED OUT",
    maxConceptSetLevels: typeof config.maxConceptSetLevels === "number" ? config.maxConceptSetLevels : 3,
    quickPrints: config.quickPrints === true,
    allowAdhocTeleConsultation: config.allowAdhocTeleConsultation === true,
    teleConsultationDomain: typeof config.teleConsultationDomain === "string" ? config.teleConsultationDomain : undefined,
    enableRadiologyOrderOptions: strings(config.enableRadiologyOrderOptions),
    enableLabOrderOptions: strings(config.enableLabOrderOptions),
    orderTypeClassMap: Object.fromEntries(Object.entries(object(config.orderTypeClassMap)).map(([key, value]) => [key, strings(value)])),
    otherInvestigationsMap: Object.fromEntries(Object.entries(object(config.otherInvestigationsMap)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    conceptSetUI: object(config.conceptSetUI),
    raw: config,
  };
}

export function parseMedicationConfig(source: Record<string, unknown>, tabName = "allMedicationTabConfig"): MedicationConfig {
  const tab = object(object(source.tabConfig)[tabName]);
  const orderSet = object(tab.orderSet);
  const options = object(tab.inputOptionsConfig);
  const automaticDurations = Array.isArray(options.autopopulateDurationBasedOnFrequency)
    ? options.autopopulateDurationBasedOnFrequency
    : Array.isArray(options.autopopulateDurationsBasedOnFrequency) ? options.autopopulateDurationsBasedOnFrequency : [];
  return {
    defaultDurationUnit: typeof options.defaultDurationUnit === "string" ? options.defaultDurationUnit : "Days",
    defaultInstructions: typeof options.defaultInstructions === "string" ? options.defaultInstructions : "As directed",
    hideOrderSet: options.hideOrderSet === true,
    durationUnitsFactors: Array.isArray(options.durationUnitsFactors) ? options.durationUnitsFactors.flatMap((value) => {
      const item = object(value);
      return typeof item.name === "string" && typeof item.factor === "number" ? [{ name: item.name, factor: item.factor }] : [];
    }) : [],
    frequencyDefaultDurationUnitsMap: Array.isArray(options.frequencyDefaultDurationUnitsMap) ? options.frequencyDefaultDurationUnitsMap.flatMap((value) => {
      const item = object(value);
      return typeof item.defaultDurationUnit === "string" ? [{ minFrequency: item.minFrequency as string | number | null | undefined, maxFrequency: item.maxFrequency as string | number | null | undefined, defaultDurationUnit: item.defaultDurationUnit }] : [];
    }) : [],
    autopopulateDurationBasedOnFrequency: automaticDurations.flatMap((value) => {
      const item = object(value);
      return typeof item.frequencyName === "string" && typeof item.duration === "number" && typeof item.durationUnit === "string"
        ? [{ frequencyName: item.frequencyName, duration: item.duration, durationUnit: item.durationUnit }]
        : [];
    }),
    drugFormDefaults: Object.fromEntries(Object.entries(object(options.drugFormDefaults)).map(([key, value]) => {
      const defaults = object(value);
      return [key, { ...(typeof defaults.doseUnits === "string" ? { doseUnits: defaults.doseUnits } : {}), ...(typeof defaults.route === "string" ? { route: defaults.route } : {}) }];
    })),
    calculateDoseOnlyOnCurrentVisitValues: orderSet.calculateDoseOnlyOnCurrentVisitValues === true,
    raw: tab,
  };
}

export function formVisibleForVisit(form: ConsultationFormConfig, visitType?: string): boolean {
  return form.visitTypes === undefined || form.visitTypes.length === 0 || Boolean(visitType && form.visitTypes.includes(visitType));
}

function configuredFrequency(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const fraction = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Reproduce los rangos legacy sin ejecutar `eval` sobre medication.json. */
export function durationUnitForFrequency(config: MedicationConfig, frequencyPerDay: number | undefined, fallback?: string): string {
  if (!frequencyPerDay) return fallback ?? config.defaultDurationUnit;
  let resolved = fallback ?? config.defaultDurationUnit;
  config.frequencyDefaultDurationUnitsMap.forEach((range) => {
    const min = configuredFrequency(range.minFrequency);
    const max = configuredFrequency(range.maxFrequency);
    if ((!min || min < frequencyPerDay) && (!max || frequencyPerDay <= max)) resolved = range.defaultDurationUnit;
  });
  return resolved;
}
