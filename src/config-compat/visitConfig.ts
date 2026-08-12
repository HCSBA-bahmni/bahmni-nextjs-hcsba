import { parseClinicalDashboardConfig, type ClinicalDashboardTab } from "./clinicalConfig";
import type { JsonObject } from "./merge";
import mandatoryVisitTab from "./visitMandatoryTab.json";

const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

// This is the application-owned mandatory configuration consumed by
// visitTabConfig.load in Angular. Keeping the JSON intact avoids maintaining a
// second, invented list of visit sections in TypeScript.
const mandatoryVisitSections = object(mandatoryVisitTab.sections);

const visitTypeAliases: Record<string, string> = {
  pivotTable: "flowSheet",
  prescription: "treatment",
  order: "ordersControl",
};

function sectionType(value: unknown): string | undefined {
  const type = object(value).type;
  return typeof type === "string" ? type : undefined;
}

function scopeSection(section: JsonObject, patientUuid: string, visitUuid: string): JsonObject {
  const config: JsonObject = { ...object(section.config), patientUuid, visitUuids: [visitUuid] };
  const translationKey = typeof section.translationKey === "string"
    ? section.translationKey
    : typeof config.translationKey === "string" ? config.translationKey : undefined;
  const type = typeof section.type === "string" ? visitTypeAliases[section.type] ?? section.type : "unknown";
  // The visit pivot template is itself guarded by ng-if="hasData" in
  // common/displaycontrols/pivottable/views/pivotTable.html. This is distinct
  // from controls that intentionally keep an empty-state section visible.
  const hideEmptyDisplayControl = section.hideEmptyDisplayControl === true || section.type === "pivotTable";
  return { ...section, type, legacyType: section.type, config, hideEmptyDisplayControl, ...(translationKey ? { translationKey } : {}) };
}

/**
 * Reproduces visitTabConfig.load: only the tab marked defaultSections receives
 * the mandatory legacy sections, and a configured section with the same type
 * replaces the mandatory definition before the final displayOrder sort.
 */
export function parseClinicalVisitConfig(source: JsonObject, patientUuid: string, visitUuid: string): ClinicalDashboardTab[] {
  const prepared: JsonObject = Object.fromEntries(Object.entries(source).map(([tabId, rawTab]) => {
    const tab = object(rawTab);
    const configured = object(tab.sections);
    let sections = configured;
    if (tab.defaultSections === true) {
      const configuredEntries = Object.entries(configured);
      const replacedSectionIds = new Set<string>();
      const mandatory = Object.entries(mandatoryVisitSections).map(([mandatoryId, rawMandatory]) => {
        const mandatorySection = object(rawMandatory);
        const match = configuredEntries.find(([, candidate]) => sectionType(candidate) === sectionType(mandatorySection));
        if (!match) return [mandatoryId, mandatorySection] as const;
        replacedSectionIds.add(match[0]);
        return [match[0], { ...mandatorySection, ...object(match[1]) }] as const;
      });
      sections = Object.fromEntries([...mandatory, ...configuredEntries.filter(([sectionId]) => !replacedSectionIds.has(sectionId))]);
    }
    return [tabId, { ...tab, sections: Object.fromEntries(Object.entries(sections).map(([sectionId, rawSection]) => [sectionId, scopeSection(object(rawSection), patientUuid, visitUuid)])) }];
  }));
  return parseClinicalDashboardConfig(prepared);
}
