import { DateTime } from "luxon";
import type { IpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";

export interface IpdShiftWindow {
  start: DateTime;
  end: DateTime;
  label: string;
}

function atTime(day: DateTime<boolean>, value: string): DateTime<boolean> {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return day.startOf("day").set({ hour, minute });
}

export function currentIpdShift(
  shiftDetails: IpdDashboardConfig["shiftDetails"],
  now: DateTime<boolean> = DateTime.local(),
): IpdShiftWindow {
  const shifts = Object.entries(shiftDetails);
  for (const [label, shift] of shifts) {
    let start = atTime(now, shift.shiftStartTime);
    let end = atTime(now, shift.shiftEndTime);
    if (end <= start) {
      if (now < end) start = start.minus({ days: 1 });
      else end = end.plus({ days: 1 });
    }
    if (now >= start && now < end) return { start, end, label };
  }
  const first = shifts[0] ?? ["1", { shiftStartTime: "08:00", shiftEndTime: "19:00" }];
  const start = atTime(now, first[1].shiftStartTime);
  let end = atTime(now, first[1].shiftEndTime);
  if (end <= start) end = end.plus({ days: 1 });
  return { start, end, label: first[0] };
}
