import { describe, expect, it } from "vitest";
import { parseIpdDashboardConfig } from "./ipdDashboardConfig";

describe("parseIpdDashboardConfig", () => {
  it("orders configured controls and retains unknown fields", () => {
    const parsed = parseIpdDashboardConfig({
      config: {
        enable24HourTimers: true,
        drugChartStartTimeFrequencies: ["Every 8 hours"],
        drugChartScheduleFrequencies: [{ name: "Twice a day", frequencyPerDay: 2, scheduleTiming: ["06:00", "18:00"] }],
        futureScheduleOption: true,
      },
      sections: [
        { title: "Diagnosis", componentKey: "DG", displayOrder: 2, future: true },
        { title: "Vitals", componentKey: "VT", displayOrder: 1 },
      ],
      futureRoot: { enabled: true },
    });
    expect(parsed.sections.map((section) => section.componentKey)).toEqual(["VT", "DG"]);
    expect(parsed.sections[1]?.extensions.future).toBe(true);
    expect(parsed.treatmentSchedule).toEqual({
      enable24HourTimers: true,
      drugChartStartTimeFrequencies: ["Every 8 hours"],
      drugChartScheduleFrequencies: [{ name: "Twice a day", frequencyPerDay: 2, scheduleTiming: ["06:00", "18:00"] }],
    });
    expect(parsed.config.futureScheduleOption).toBe(true);
    expect(parsed.extensions.futureRoot).toEqual({ enabled: true });
  });
});
