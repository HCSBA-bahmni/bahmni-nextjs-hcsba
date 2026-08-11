import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { buildCareWindow, careTeamAction, careViewPatientDashboardHref, classifyTaskStatus, isPreviousPending, moveCareWindow, readSelectedWard, resolveShift, saveSelectedWard } from "./domain";
import type { CareTask } from "./types";

const shifts = [
  { id: "day", startTime: "08:00", endTime: "19:00" },
  { id: "night", startTime: "19:00", endTime: "08:00" },
];

describe("Care View time domain", () => {
  it("resolves an overnight shift against the previous calendar day", () => {
    const moment = DateTime.fromISO("2026-08-10T03:30:00", { zone: "America/Santiago" });
    const result = resolveShift(moment, shifts);
    expect(result.shift.id).toBe("night");
    expect(result.start.toISODate()).toBe("2026-08-09");
    expect(result.end.toISODate()).toBe("2026-08-10");
  });

  it("aligns two-hour windows and prevents navigation beyond the shift", () => {
    const moment = DateTime.fromISO("2026-08-10T10:35:00", { zone: "America/Santiago" });
    const current = buildCareWindow(moment, shifts, 2);
    expect(current.start.toFormat("HH:mm")).toBe("10:00");
    expect(current.end.toFormat("HH:mm")).toBe("12:00");
    expect(moveCareWindow(current, -1, 2, moment)?.start.toFormat("HH:mm")).toBe("08:00");
    expect(moveCareWindow(moveCareWindow(current, -1, 2, moment)!, -1, 2, moment)).toBeNull();
  });
});

describe("Care View task and team rules", () => {
  it("links an admitted patient to the native IPD dashboard and preserves the Care View return context", () => {
    expect(careViewPatientDashboardHref({ uuid: "patient 1", visitUuid: "visit/1" })).toBe("/clinical/patient/patient%201/dashboard/visit/ipd/visit%2F1?source=careViewDashboard");
    expect(careViewPatientDashboardHref({ uuid: "patient 1" })).toBe("/bedmanagement/patient/patient%201");
  });

  it("classifies administered-late, missed and late tasks using configured thresholds", () => {
    const scheduled = Date.parse("2026-08-10T10:00:00Z");
    expect(classifyTaskStatus({ rawStatus: "ADMINISTERED", scheduledTime: scheduled, completedTime: scheduled + 61 * 60_000, pastLateMinutes: 60, administeredLateMinutes: 60 })).toBe("administered-late");
    expect(classifyTaskStatus({ rawStatus: "NOT_ADMINISTERED", scheduledTime: scheduled, pastLateMinutes: 60, administeredLateMinutes: 60 })).toBe("missed");
    expect(classifyTaskStatus({ rawStatus: "REQUESTED", scheduledTime: scheduled, now: scheduled + 61 * 60_000, pastLateMinutes: 60, administeredLateMinutes: 60 })).toBe("late");
  });

  it("recognizes daemon-created pending tasks from the previous shift", () => {
    const previous = { start: DateTime.fromISO("2026-08-09T19:00:00Z"), end: DateTime.fromISO("2026-08-10T08:00:00Z") };
    const task = { status: "pending", creator: "daemon", scheduledTime: Date.parse("2026-08-10T02:00:00Z") } as CareTask;
    expect(isPreviousPending(task, previous)).toBe(true);
  });

  it("allows only the current provider to remove a current-shift assignment", () => {
    const now = DateTime.fromISO("2026-08-10T10:00:00Z");
    const window = buildCareWindow(now, shifts, 2);
    expect(careTeamAction([], "provider", window, now)).toBe("assign");
    expect(careTeamAction([{ providerUuid: "provider" }], "provider", window, now)).toBe("remove");
    expect(careTeamAction([{ providerUuid: "other" }], "provider", window, now)).toBe("blocked");
  });
});

describe("selected_wards compatibility", () => {
  it("persists each provider selection without losing other providers", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveSelectedWard(storage, "one", "ward-a");
    saveSelectedWard(storage, "two", "ward-b");
    expect(readSelectedWard(storage, "one")).toBe("ward-a");
    expect(readSelectedWard(storage, "two")).toBe("ward-b");
  });
});
