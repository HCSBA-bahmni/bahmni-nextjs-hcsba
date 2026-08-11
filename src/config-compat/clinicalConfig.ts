import type { JsonObject } from "./merge";

export interface ClinicalDashboardSection {
  id: string;
  type: string;
  sourceIndex: number;
  translationKey?: string;
  title?: string;
  displayOrder?: number;
  displayType: "Full-Page" | "Half-Page";
  requiredPrivilege?: string | string[];
  hideEmptyDisplayControl?: boolean;
  dashboardConfig: JsonObject;
  expandedViewConfig: JsonObject;
  config: JsonObject;
  formGroup: string[];
  raw: JsonObject;
}

export interface ClinicalDashboardTab {
  id: string;
  translationKey: string;
  displayByDefault: boolean;
  sections: ClinicalDashboardSection[];
  raw: JsonObject;
}

const asObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

export function parseClinicalDashboardConfig(source: JsonObject): ClinicalDashboardTab[] {
  return Object.entries(source).flatMap(([id, value]) => {
    const tab = asObject(value);
    const sections = asObject(tab.sections);
    if (Object.keys(sections).length === 0) return [];
    return [{
      id,
      translationKey: typeof tab.translationKey === "string" ? tab.translationKey : id,
      displayByDefault: tab.displayByDefault === true,
      raw: tab,
      sections: Object.entries(sections).map(([sectionId, sectionValue], sourceIndex) => {
        const section = asObject(sectionValue);
        return {
          id: sectionId,
          type: typeof section.type === "string" ? section.type : "unknown",
          sourceIndex,
          translationKey: typeof section.translationKey === "string" ? section.translationKey : undefined,
          title: typeof section.title === "string" ? section.title : undefined,
          displayOrder: typeof section.displayOrder === "number" ? section.displayOrder : undefined,
          displayType: section.displayType === "Full-Page" ? "Full-Page" as const : "Half-Page" as const,
          requiredPrivilege: typeof section.requiredPrivilege === "string" || Array.isArray(section.requiredPrivilege) ? section.requiredPrivilege as string | string[] : undefined,
          hideEmptyDisplayControl: section.hideEmptyDisplayControl === true,
          dashboardConfig: asObject(section.dashboardConfig),
          expandedViewConfig: Object.keys(asObject(section.expandedViewConfig)).length > 0
            ? asObject(section.expandedViewConfig)
            : asObject(section.allFlowSheetDetails),
          config: asObject(section.config),
          formGroup: Array.isArray(section.formGroup) ? section.formGroup.filter((value): value is string => typeof value === "string") : [],
          raw: section,
        };
      }).sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) || a.sourceIndex - b.sourceIndex),
    }];
  });
}

export const supportedClinicalSectionTypes = new Set([
  "patientInformation", "visits", "observation", "vitals", "flowSheet", "observationGraph",
  "obsToObsFlowSheet", "historyAndExamination", "diagnosis", "allergies", "conditionsList",
  "programs", "navigationLinksControl", "forms", "formsV2React", "disposition", "treatment",
  "drugOrderDetails", "chronicTreatmentChart", "ordersControl", "labOrders", "radiology",
  "pacsOrders", "bacteriologyResultsControl", "admissionDetails", "allOrdersReact", "ipsReact",
  "ipsIcvpReact", "custom",
]);
