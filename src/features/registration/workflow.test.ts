import { describe, expect, it } from "vitest";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { formatRegistrationDestination, resolveRegistrationWorkflow, toNextRegistrationRoute } from "./workflow";

const baseConfig = parseRegistrationConfig({ config: { defaultVisitType: "OPD" } });
const visitType = { uuid: "opd-uuid", name: "OPD", display: "OPD" };
const activeVisit = { uuid: "visit-uuid", startDatetime: "2026-08-03T10:00:00Z", visitType };

describe("registration patient action parity", () => {
  it("starts the configured visit when the patient has no active visit", () => expect(resolveRegistrationWorkflow({ config: baseConfig, selectedVisitType: visitType, canStartVisit: true })).toMatchObject({ intent: { kind: "startVisit", visitTypeUuid: "opd-uuid" }, translationKey: "REGISTRATION_START_VISIT" }));
  it("enters visit details when an active visit exists", () => expect(resolveRegistrationWorkflow({ config: baseConfig, activeVisit, selectedVisitType: visitType, canStartVisit: true })).toMatchObject({ intent: { kind: "enterVisit", visitUuid: "visit-uuid" } }));
  it("uses the visit-specific forward action", () => {
    const config = parseRegistrationConfig({ config: { forwardUrlsForVisitTypes: [{ visitType: "OPD", forwardUrl: "/clinical/{{patientUuid}}", translationKey: "GO_CLINICAL" }] } });
    expect(resolveRegistrationWorkflow({ config, activeVisit, selectedVisitType: visitType, canStartVisit: true })).toMatchObject({ intent: { kind: "forward", url: "/clinical/{{patientUuid}}" }, translationKey: "GO_CLINICAL" });
  });
  it("gives a configured next-step extension precedence", () => expect(resolveRegistrationWorkflow({ config: baseConfig, activeVisit, selectedVisitType: visitType, canStartVisit: true, nextExtension: { id: "next", extensionPointId: "org.bahmni.registration.patient.next", type: "config", extensionParams: { forwardUrl: "/custom/{{patientUuid}}", display: "NEXT_STEP" } } })).toMatchObject({ intent: { kind: "forward", url: "/custom/{{patientUuid}}" }, translationKey: "NEXT_STEP" }));
  it("can hide the start visit action", () => expect(resolveRegistrationWorkflow({ config: parseRegistrationConfig({ config: { showStartVisitButton: false } }), selectedVisitType: visitType, canStartVisit: true })).toBeNull());
  it("formats legacy destinations without changing their wire template", () => {
    expect(formatRegistrationDestination("/clinical/{{patientUuid}}/{{visitUuid}}", "patient", "visit")).toBe("/clinical/patient/visit");
    expect(toNextRegistrationRoute("/patient/patient")).toBe("/registration/patient/patient");
  });
});
