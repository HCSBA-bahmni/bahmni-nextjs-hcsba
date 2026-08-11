import { z } from "zod";

export interface CareViewConfig {
  pageSizeOptions: number[];
  defaultPageSize: number;
  timeframeLimitInHours: number;
  extensions: Record<string, unknown>;
}

export interface CareShiftConfig {
  id: string;
  startTime: string;
  endTime: string;
}

export interface IpdOperationalConfig {
  enable24HourTime: boolean;
  shifts: CareShiftConfig[];
  nursingTasks: {
    relevantBeforeMinutes: number;
    pastLateMinutes: number;
    administeredLateMinutes: number;
  };
  drugChart: {
    pastLateMinutes: number;
    administeredLateMinutes: number;
  };
  extensions: Record<string, unknown>;
}

const careViewSchema = z.object({
  pageSizeOptions: z.array(z.coerce.number().int().positive()).default([10, 20, 30, 40, 50]),
  defaultPageSize: z.coerce.number().int().positive().default(10),
  timeframeLimitInHours: z.coerce.number().positive().default(2),
}).loose();

const thresholdSchema = z.object({
  timeInMinutesFromNowToShowTaskAsRelevant: z.coerce.number().nonnegative().default(30),
  timeInMinutesFromNowToShowPastTaskAsLate: z.coerce.number().nonnegative().default(60),
  timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: z.coerce.number().nonnegative().default(60),
}).loose();

const drugThresholdSchema = z.object({
  timeInMinutesFromNowToShowPastTaskAsLate: z.coerce.number().nonnegative().default(60),
  timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: z.coerce.number().nonnegative().default(60),
}).loose();

const shiftSchema = z.object({
  shiftStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{2}:\d{2}$/),
}).loose();

const operationalSchema = z.object({
  enable24HourTime: z.boolean().default(false),
  shiftDetails: z.record(z.string(), shiftSchema).default({
    "1": { shiftStartTime: "08:00", shiftEndTime: "20:00" },
    "2": { shiftStartTime: "20:00", shiftEndTime: "08:00" },
  }),
  nursingTasks: thresholdSchema.default({
    timeInMinutesFromNowToShowTaskAsRelevant: 30,
    timeInMinutesFromNowToShowPastTaskAsLate: 60,
    timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60,
  }),
  drugChart: drugThresholdSchema.default({
    timeInMinutesFromNowToShowPastTaskAsLate: 60,
    timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60,
  }),
}).loose();

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseCareViewConfig(raw: Record<string, unknown>): CareViewConfig {
  const source = Object.keys(object(raw.config)).length ? object(raw.config) : raw;
  const parsed = careViewSchema.parse(source);
  const options = [...new Set(parsed.pageSizeOptions)].sort((left, right) => left - right);
  if (!options.includes(parsed.defaultPageSize)) options.push(parsed.defaultPageSize);
  return {
    pageSizeOptions: options.sort((left, right) => left - right),
    defaultPageSize: parsed.defaultPageSize,
    timeframeLimitInHours: parsed.timeframeLimitInHours,
    extensions: source,
  };
}

export function parseIpdOperationalConfig(raw: Record<string, unknown>): IpdOperationalConfig {
  const parsed = operationalSchema.parse(raw);
  return {
    enable24HourTime: parsed.enable24HourTime,
    shifts: Object.entries(parsed.shiftDetails)
      .map(([id, shift]) => ({ id, startTime: shift.shiftStartTime, endTime: shift.shiftEndTime }))
      .sort((left, right) => left.startTime.localeCompare(right.startTime)),
    nursingTasks: {
      relevantBeforeMinutes: parsed.nursingTasks.timeInMinutesFromNowToShowTaskAsRelevant,
      pastLateMinutes: parsed.nursingTasks.timeInMinutesFromNowToShowPastTaskAsLate,
      administeredLateMinutes: parsed.nursingTasks.timeInMinutesFromStartTimeToShowAdministeredTaskAsLate,
    },
    drugChart: {
      pastLateMinutes: parsed.drugChart.timeInMinutesFromNowToShowPastTaskAsLate,
      administeredLateMinutes: parsed.drugChart.timeInMinutesFromStartTimeToShowAdministeredTaskAsLate,
    },
    extensions: raw,
  };
}
