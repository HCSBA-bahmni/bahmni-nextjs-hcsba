import { describe, expect, it } from "vitest";
import type { Visit } from "@/types/bahmni";
import { hasActiveAdmission, registrationVisitUrl, resolveVisitManagementAction } from "./visitManagement";

const activeVisit: Visit = { uuid: "visit-active", startDatetime: "2026-08-14T11:46:00-04:00", stopDatetime: null };
const closePrivileges = new Set(["app:common:closeVisit"]);

describe("clinical visit management action", () => {
  it("distinguishes an active admission from one with a recorded discharge", () => {
    expect(hasActiveAdmission({ admissionDetails: { uuid: "admission" } })).toBe(true);
    expect(hasActiveAdmission({ admissionDetails: { uuid: "admission" }, dischargeDetails: { uuid: "discharge" } })).toBe(false);
  });

  it("offers finalization for the selected active visit when no admission blocks it", () => {
    expect(resolveVisitManagementAction(activeVisit, activeVisit.uuid, {}, closePrivileges)).toEqual({
      label: "Finalizar visita",
      pendingDischargeClosure: false,
    });
  });

  it("marks a discharged admission that remains pending visit closure", () => {
    expect(resolveVisitManagementAction(activeVisit, activeVisit.uuid, {
      admissionDetails: { uuid: "admission" },
      dischargeDetails: { uuid: "discharge" },
    }, closePrivileges)).toEqual({
      label: "Finalizar visita",
      pendingDischargeClosure: true,
    });
  });

  it("does not offer finalization before discharge", () => {
    expect(resolveVisitManagementAction(activeVisit, activeVisit.uuid, {
      admissionDetails: { uuid: "admission" },
    }, closePrivileges)).toBeUndefined();
  });

  it("does not offer the action for another visit, a closed visit, or a user without privileges", () => {
    expect(resolveVisitManagementAction(activeVisit, "another-visit", {}, closePrivileges)).toBeUndefined();
    expect(resolveVisitManagementAction({ ...activeVisit, stopDatetime: "2026-08-14T12:00:00-04:00" }, activeVisit.uuid, {}, closePrivileges)).toBeUndefined();
    expect(resolveVisitManagementAction(activeVisit, activeVisit.uuid, {}, new Set())).toBeUndefined();
  });

  it("does not offer finalization when the clinical summary is unavailable", () => {
    expect(resolveVisitManagementAction(activeVisit, activeVisit.uuid, undefined, closePrivileges)).toBeUndefined();
  });

  it("routes to the existing registration visit workflow", () => {
    expect(registrationVisitUrl("patient uuid", "visit uuid")).toEqual({
      pathname: "/registration/patient/patient uuid/visit",
      query: { visitUuid: "visit uuid" },
    });
  });
});
