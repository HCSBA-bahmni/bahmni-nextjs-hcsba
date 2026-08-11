import { parseClinicalDashboardConfig, type ClinicalDashboardTab } from "@/config-compat/clinicalConfig";
import type { JsonObject } from "@/config-compat/merge";
import type { IpdConfig } from "./types";

/**
 * IPD legacy delegates every configured section to the shared Bahmni dashboard
 * controls. Rebuild that same tab contract instead of rendering section values
 * generically (which loses dates, coded answers, grouped observations and links).
 */
export function toClinicalIpdDashboardTab(dashboard: IpdConfig["dashboard"]): ClinicalDashboardTab | undefined {
  const sections = Object.fromEntries(dashboard.sections.map(({ id, ...section }) => [id, section])) as JsonObject;
  return parseClinicalDashboardConfig({
    ipd: {
      translationKey: dashboard.translationKey ?? "DASHBOARD_TAB_GENERAL_KEY",
      displayByDefault: true,
      conceptName: dashboard.conceptName,
      sections,
    },
  })[0];
}
