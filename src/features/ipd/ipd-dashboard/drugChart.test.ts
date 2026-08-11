import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { CareTask } from "@/features/ipd/care-view/types";
import { buildDrugChartRows, drugChartIntervals, normalizeDrugChartMedications, tasksInDrugChartInterval } from "./drugChart";

const task = (overrides: Partial<CareTask> = {}): CareTask => ({
  uuid: "slot-1",
  patientUuid: "patient",
  kind: "medication",
  name: "Paracetamol 500 mg",
  status: "pending",
  scheduledTime: DateTime.fromISO("2026-08-11T18:00:00").toMillis(),
  extensions: { order: { uuid: "order-1" } },
  ...overrides,
});

describe("IPD drug chart parity", () => {
  it("keeps scheduled visit medications even when the selected shift has no slots", () => {
    const medications = normalizeDrugChartMedications({
      ipdDrugOrders: [{
        drugOrder: {
          uuid: "order-1",
          drug: { display: "Paracetamol 500 mg" },
          duration: 20,
          durationUnits: "Days",
          dosingInstructions: { dose: 1, doseUnits: "Comprimido", route: "Oral" },
        },
        drugOrderSchedule: {
          firstDaySlotsStartTime: [1_786_473_600],
          dayWiseSlotsStartTime: [1_786_430_400, 1_786_473_600],
          remainingDaySlotsStartTime: [],
        },
      }],
      emergencyMedications: [],
    }, "visit");

    expect(buildDrugChartRows(medications, [])).toEqual([expect.objectContaining({
      uuid: "order-1",
      name: "Paracetamol 500 mg",
      details: "1 Comprimido · Oral · 20 Days",
      tasks: [],
    })]);
  });

  it("renders every half-hour in the shift instead of only times containing tasks", () => {
    const shift = {
      label: "1",
      start: DateTime.fromISO("2026-08-11T08:00:00"),
      end: DateTime.fromISO("2026-08-11T19:00:00"),
    };
    const intervals = drugChartIntervals(shift);
    expect(intervals).toHaveLength(22);
    expect(DateTime.fromMillis(intervals[0]!.start).toFormat("HH:mm")).toBe("08:00");
    expect(DateTime.fromMillis(intervals.at(-1)!.start).toFormat("HH:mm")).toBe("18:30");
  });

  it("places completed doses at their administration time like legacy", () => {
    const interval = {
      start: DateTime.fromISO("2026-08-11T18:30:00").toMillis(),
      end: DateTime.fromISO("2026-08-11T19:00:00").toMillis(),
    };
    const completed = task({
      status: "administered",
      completedTime: DateTime.fromISO("2026-08-11T18:40:00").toMillis(),
    });
    expect(tasksInDrugChartInterval([completed], interval)).toEqual([completed]);
  });
});
