import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { currentIpdShift } from "./domain";

describe("currentIpdShift", () => {
  const shifts = {
    "1": { shiftStartTime: "08:00", shiftEndTime: "19:00" },
    "2": { shiftStartTime: "19:00", shiftEndTime: "08:00" },
  };

  it("resolves the daytime shift", () => {
    const shift = currentIpdShift(shifts, DateTime.fromISO("2026-08-10T12:00:00"));
    expect(shift.label).toBe("1");
    expect(shift.start.toFormat("HH:mm")).toBe("08:00");
  });

  it("resolves a night shift across midnight", () => {
    const shift = currentIpdShift(shifts, DateTime.fromISO("2026-08-10T02:00:00"));
    expect(shift.label).toBe("2");
    expect(shift.start.toISODate()).toBe("2026-08-09");
    expect(shift.end.toISODate()).toBe("2026-08-10");
  });
});
