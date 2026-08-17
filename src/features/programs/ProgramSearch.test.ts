import { describe, expect, it } from "vitest";
import { legacyProgramPatientUrl } from "./ProgramSearch";
import { displayAttributeValue, hasProgramAttributeValue, maximumEnrollmentDate, programChronologyError, programDashboardUrl, programEnrollmentAttributes, programUpdateAttributes, requiredProgramAttributesComplete } from "./ProgramPatientDetail";

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

  it("uses the same scoped dashboard link for active programs", () => {
    const url = new URL(programDashboardUrl("patient", {
      uuid: "enrollment", name: "HIV", active: true, dateEnrolled: "2025-01-01", attributes: [], states: [], raw: { program: { uuid: "program" } },
    }), "https://hcsba.local");
    expect(Object.fromEntries(url.searchParams)).toEqual({ enrollment: "enrollment", programUuid: "program", dateEnrolled: "2025-01-01" });
  });
});

describe("program attribute payloads", () => {
  const booleanAttribute = { uuid: "boolean", name: "Consent", datatypeClassname: "java.lang.Boolean" };

  it("treats false as an answered value and sends it to legacy as a string", () => {
    expect(hasProgramAttributeValue(false)).toBe(true);
    expect(programEnrollmentAttributes([booleanAttribute], { boolean: false })).toEqual([{ attributeType: { uuid: "boolean" }, value: "false" }]);
  });

  it("preserves a persisted false value and does not void a never-created optional attribute", () => {
    expect(programUpdateAttributes([booleanAttribute], [{ uuid: "stored", attributeType: { uuid: "boolean" }, value: "false" }], {})).toEqual([{ uuid: "stored", attributeType: { uuid: "boolean" }, value: "false" }]);
    expect(programUpdateAttributes([booleanAttribute], [], {})).toEqual([]);
  });

  it("rejects explicitly clearing a persisted required boolean while preserving an untouched false", () => {
    const stored = [{ uuid: "stored", attributeType: { uuid: "boolean" }, value: "false" }];
    const config = { program: { Consent: { required: true } } };
    expect(requiredProgramAttributesComplete([booleanAttribute], stored, {}, config)).toBe(true);
    expect(requiredProgramAttributesComplete([booleanAttribute], stored, { boolean: undefined }, config)).toBe(false);
    expect(programUpdateAttributes([booleanAttribute], stored, { boolean: undefined })).toEqual([{ uuid: "stored", attributeType: { uuid: "boolean" }, voided: true }]);
  });
});

describe("program enrollment chronology", () => {
  it("does not allow an enrollment date after an existing state", () => {
    expect(maximumEnrollmentDate([{ startDate: "2026-08-12T00:00:00.000-0400" }, { startDate: "2026-08-14T00:00:00.000-0400" }], "2026-08-17")).toBe("2026-08-12");
  });

  it("requires an enrollment date before saving", () => {
    expect(programChronologyError({ dateEnrolled: "", maxEnrollmentDate: "2026-08-17", stateChanged: false, completing: false, actionDate: "2026-08-17" })).toBe("Ingrese la fecha de enrolamiento antes de guardar.");
  });

  it("rejects state and outcome dates before the active state", () => {
    expect(programChronologyError({ dateEnrolled: "2026-08-10", maxEnrollmentDate: "2026-08-17", activeStateStartDate: "2026-08-18T00:00:00.000-0400", stateChanged: true, completing: false, actionDate: "2026-08-17" })).toContain("nuevo estado no puede comenzar antes");
    expect(programChronologyError({ dateEnrolled: "2026-08-10", maxEnrollmentDate: "2026-08-17", activeStateStartDate: "2026-08-18T00:00:00.000-0400", stateChanged: false, completing: true, actionDate: "2026-08-17" })).toContain("programa no puede finalizar antes");
  });
});
