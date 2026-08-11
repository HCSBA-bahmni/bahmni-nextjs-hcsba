import { describe, expect, it } from "vitest";
import { parseCareViewConfig, parseIpdOperationalConfig } from "./careViewConfig";

describe("Care View configuration", () => {
  it("normalizes pagination and preserves unknown extensions", () => {
    const result = parseCareViewConfig({ pageSizeOptions: [20, 10, 20], defaultPageSize: 15, timeframeLimitInHours: 2, futureOption: true });
    expect(result.pageSizeOptions).toEqual([10, 15, 20]);
    expect(result.timeframeLimitInHours).toBe(2);
    expect(result.extensions.futureOption).toBe(true);
  });

  it("reads HCSBA shifts and threshold values from the IPD dashboard config", () => {
    const result = parseIpdOperationalConfig({
      enable24HourTime: false,
      shiftDetails: {
        "1": { shiftStartTime: "08:00", shiftEndTime: "19:00" },
        "2": { shiftStartTime: "19:00", shiftEndTime: "08:00" },
      },
      nursingTasks: {
        timeInMinutesFromNowToShowTaskAsRelevant: 20,
        timeInMinutesFromNowToShowPastTaskAsLate: 40,
        timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 50,
      },
      drugChart: {
        timeInMinutesFromNowToShowPastTaskAsLate: 60,
        timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 70,
      },
      futureOption: { enabled: true },
    });
    expect(result.shifts).toEqual([
      { id: "1", startTime: "08:00", endTime: "19:00" },
      { id: "2", startTime: "19:00", endTime: "08:00" },
    ]);
    expect(result.nursingTasks).toMatchObject({ relevantBeforeMinutes: 20, pastLateMinutes: 40, administeredLateMinutes: 50 });
    expect(result.drugChart).toMatchObject({ pastLateMinutes: 60, administeredLateMinutes: 70 });
    expect(result.extensions.futureOption).toEqual({ enabled: true });
  });
});
