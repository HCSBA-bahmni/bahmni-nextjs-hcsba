import { describe, expect, it } from "vitest";
import { normalizeDashboardPrograms } from "./programRecords";

describe("legacy dashboard program contract", () => {
  it("groups active before ended programs and preserves attributes, facility, outcome and dated states", () => {
    const programs = normalizeDashboardPrograms([
      { uuid: "ended", display: "TB", dateEnrolled: "2025-01-01", dateCompleted: "2025-03-01", outcome: { display: "Completed" }, attributes: [], states: [] },
      { uuid: "active", program: { display: "HIV" }, dateEnrolled: "2026-01-01", location: { display: "HCSBA" }, attributes: [{ attributeType: { description: "Doctor" }, value: { display: "Super Man" } }], states: [{ state: { concept: { display: "On treatment" } }, startDate: "2026-01-02", endDate: null }] },
    ]);
    expect(programs.map((program) => program.uuid)).toEqual(["active", "ended"]);
    expect(programs[0]).toMatchObject({ name: "HIV", active: true, location: "HCSBA", attributes: [{ name: "Doctor", value: "Super Man" }], states: [{ name: "On treatment", startDate: "2026-01-02" }] });
    expect(programs[1]).toMatchObject({ active: false, outcome: "Completed" });
  });

  it("removes voided programs, attributes without values and voided states", () => {
    const programs = normalizeDashboardPrograms([
      { uuid: "voided", voided: true },
      { uuid: "kept", display: "Program", attributes: [{ attributeType: { display: "Empty" }, value: "" }], states: [{ voided: true }, { state: { display: "Active" } }] },
    ]);
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({ uuid: "kept", attributes: [], states: [{ name: "Active" }] });
  });
});
