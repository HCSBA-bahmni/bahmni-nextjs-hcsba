import { z } from "zod";
import type { AppExtension, BahmniUser } from "@/types/bahmni";
import { hasPrivilege } from "@/services/bahmni/auth";
import type { IpdConfig, IpdDashboardSection, IpdQueue } from "@/features/ipd/types";

const sectionSchema = z.object({
  type: z.string(),
  translationKey: z.string().optional(),
  displayOrder: z.number().default(0),
  requiredPrivilege: z.union([z.string(), z.array(z.string())]).optional(),
  dashboardConfig: z.record(z.string(), z.unknown()).optional(),
  expandedViewConfig: z.record(z.string(), z.unknown()).optional(),
}).loose();

const configSchema = z.object({
  wardListPrintEnabled: z.boolean().default(false),
  wardListPrintViewTemplateUrl: z.string().optional(),
  wardListPrintAttributes: z.array(z.string()).default([]),
  wardListSqlSearchHandler: z.string().optional(),
  ignoredTabularViewHeadings: z.array(z.string()).default([]),
  diagnosisStatus: z.string().optional(),
  defaultVisitType: z.string().optional(),
  enableIPDFeature: z.boolean().default(true),
  expectedDateOfDischarge: z.string().optional(),
  hideStartNewVisitPopUp: z.boolean().default(false),
  enableAutoConvertToIPDVisit: z.boolean().default(false),
  patientForwardUrl: z.string().optional(),
  oirsApiBaseUrl: z.string().url().optional(),
  dashboard: z.object({
    translationKey: z.string().optional(),
    conceptName: z.string().optional(),
    sections: z.record(z.string(), sectionSchema).default({}),
  }).loose().default({ sections: {} }),
}).loose();

function root(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.config;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : raw;
}

export function parseIpdConfig(raw: Record<string, unknown>): IpdConfig {
  const parsed = configSchema.parse(root(raw));
  const sections: IpdDashboardSection[] = Object.entries(parsed.dashboard.sections)
    .map(([id, value]) => ({ id, ...value }))
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id));
  const { dashboard, ...config } = parsed;
  return {
    ...config,
    dashboard: { translationKey: dashboard.translationKey, conceptName: dashboard.conceptName, sections },
    extensions: root(raw),
  };
}

function params(extension: AppExtension): Record<string, unknown> {
  return extension.extensionParams && typeof extension.extensionParams === "object" && !Array.isArray(extension.extensionParams)
    ? extension.extensionParams as Record<string, unknown> : {};
}

export function parseIpdQueues(extensions: AppExtension[], user: BahmniUser | null): IpdQueue[] {
  return extensions
    .filter((extension) => extension.extensionPointId === "org.bahmni.patient.search" && extension.type === "config")
    .filter((extension) => hasPrivilege(user, extension.requiredPrivilege))
    .map((extension) => {
      const values = params(extension);
      return {
        id: extension.id,
        label: typeof extension.label === "string" ? extension.label : extension.id,
        translationKey: typeof values.translationKey === "string" ? values.translationKey : extension.translationKey,
        handler: typeof values.searchHandler === "string" ? values.searchHandler : undefined,
        forwardUrl: typeof values.forwardUrl === "string" ? values.forwardUrl : undefined,
        additionalParams: typeof values.additionalParams === "string" ? values.additionalParams : undefined,
        searchColumns: Array.isArray(values.searchColumns) && values.searchColumns.some((value) => typeof value === "string")
          ? values.searchColumns.filter((value): value is string => typeof value === "string")
          : ["identifier", "name"],
        order: extension.order ?? 0,
        requiredPrivilege: extension.requiredPrivilege,
      };
    })
    .sort((left, right) => left.order - right.order);
}
