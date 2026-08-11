import { z } from "zod";

const looseRecord = z.record(z.string(), z.unknown());

const sectionSchema = z.object({
  title: z.string(),
  componentKey: z.string(),
  displayOrder: z.number().default(0),
  refreshKey: z.union([z.string(), z.number()]).optional(),
}).loose();

const thresholdSchema = z.object({
  timeInMinutesFromNowToShowTaskAsRelevant: z.number().optional(),
  timeInMinutesFromNowToShowPastTaskAsLate: z.number().default(60),
  timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: z.number().default(60),
}).loose().default({
  timeInMinutesFromNowToShowPastTaskAsLate: 60,
  timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60,
});

const shiftSchema = z.object({
  shiftStartTime: z.string(),
  shiftEndTime: z.string(),
}).loose();

const dashboardSchema = z.object({
  config: looseRecord.default({}),
  sections: z.array(sectionSchema).default([]),
  nonMedicationTaskTypes: z.array(z.string()).default([]),
  nursingTasks: thresholdSchema,
  drugChart: thresholdSchema,
  drugChartSlider: z.object({
    timeInMinutesToDisableSlotPostScheduledTime: z.number().default(60),
  }).loose().default({ timeInMinutesToDisableSlotPostScheduledTime: 60 }),
  enable24HourTime: z.boolean().default(false),
  medicationTags: z.record(z.string(), z.string()).default({}),
  shiftDetails: z.record(z.string(), shiftSchema).default({
    "1": { shiftStartTime: "08:00", shiftEndTime: "19:00" },
    "2": { shiftStartTime: "19:00", shiftEndTime: "08:00" },
  }),
  vitalsConfig: z.object({
    latestVitalsConceptValues: z.record(z.string(), z.string()).default({}),
    vitalsHistoryConceptValues: z.record(z.string(), z.string()).default({}),
  }).loose().default({
    latestVitalsConceptValues: {},
    vitalsHistoryConceptValues: {},
  }),
}).loose();

export type IpdDashboardComponentKey = "VT" | "AL" | "DG" | "TR" | "NT" | "DC" | string;

export interface IpdDashboardSectionConfig {
  title: string;
  componentKey: IpdDashboardComponentKey;
  displayOrder: number;
  refreshKey?: string | number;
  extensions: Record<string, unknown>;
}

export interface IpdDashboardConfig {
  config: Record<string, unknown>;
  sections: IpdDashboardSectionConfig[];
  nonMedicationTaskTypes: string[];
  nursingTasks: {
    timeInMinutesFromNowToShowTaskAsRelevant?: number;
    timeInMinutesFromNowToShowPastTaskAsLate: number;
    timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: number;
  };
  drugChart: {
    timeInMinutesFromNowToShowTaskAsRelevant?: number;
    timeInMinutesFromNowToShowPastTaskAsLate: number;
    timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: number;
  };
  drugChartSlider: { timeInMinutesToDisableSlotPostScheduledTime: number };
  enable24HourTime: boolean;
  medicationTags: Record<string, string>;
  shiftDetails: Record<string, { shiftStartTime: string; shiftEndTime: string }>;
  vitalsConfig: {
    latestVitalsConceptValues: Record<string, string>;
    vitalsHistoryConceptValues: Record<string, string>;
  };
  extensions: Record<string, unknown>;
}

export function parseIpdDashboardConfig(raw: Record<string, unknown>): IpdDashboardConfig {
  const parsed = dashboardSchema.parse(raw);
  return {
    ...parsed,
    sections: parsed.sections
      .map((section) => ({
        title: section.title,
        componentKey: section.componentKey,
        displayOrder: section.displayOrder,
        refreshKey: section.refreshKey,
        extensions: section,
      }))
      .sort((left, right) => left.displayOrder - right.displayOrder || left.title.localeCompare(right.title)),
    extensions: raw,
  };
}
