import { describe, expect, it } from "vitest";
import { legacyProgramPatientUrl } from "./ProgramSearch";
import { displayAttributeValue, programDashboardUrl } from "./ProgramPatientDetail";

describe("program search navigation", () => {
  it("opens the native program-management detail", () => {
    expect(legacyProgramPatientUrl("patient uuid")).toBe("/bahmni/clinical/programs/patient/patient%20uuid");
  });
});

describe("program attribute presentation", () => {
  it("formats OpenMRS ISO date attributes without changing identifiers", () => {
    expect(displayAttributeValue("2026-08-14T00:00:00.000-0400")).toBe("14/08/2026");
    expect(displayAttributeValue("**123**")).toBe("**123**");
  });
});

describe("historical program dashboard navigation", () => {
  it("preserves the enrollment and historical date range in the native dashboard link", () => {
    const url = new URL(programDashboardUrl("patient id", {
      uuid: "enrollment id", name: "TB", active: false, dateEnrolled: "2025-01-01", dateCompleted: "2025-03-01", attributes: [], states: [], raw: { program: { uuid: "program id" } },
    }), "https://hcsba.local");
    expect(url.pathname).toBe("/bahmni/clinical/patient/patient%20id/dashboard");
    expect(Object.fromEntries(url.searchParams)).toEqual({ enrollment: "enrollment id", programUuid: "program id", dateEnrolled: "2025-01-01", dateCompleted: "2025-03-01" });
  });
});
