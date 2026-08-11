import { describe, expect, it } from "vitest";
import { clinicalPatientDestination, filterClinicalPatients, normalizeClinicalPatient, parseClinicalPatientSearchTabs } from "./patientSearch";
import type { AppExtension, BahmniUser } from "@/types/bahmni";

const user = { uuid: "user", privileges: [{ uuid: "clinical", name: "app:clinical" }], roles: [] } as BahmniUser;
const extensions: AppExtension[] = [
  { id: "active", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Active", order: 1, requiredPrivilege: "app:clinical", extensionParams: { searchHandler: "emrapi.sqlSearch.activePatients", translationKey: "MODULE_LABEL_ACTIVE_KEY", forwardUrl: "#/default/patient/{{patientUuid}}/dashboard" } },
  { id: "programs", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Programs", order: 1, requiredPrivilege: "app:clinical", extensionParams: { searchHandler: "emrapi.sqlSearch.activePatients", forwardUrl: "#/default/patient/{{patientUuid}}/consultationContext" } },
  { id: "notifications", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Notifications", order: 4, requiredPrivilege: "app:clinical", extensionParams: { view: "custom", templateUrl: "/legacy.html" } },
  { id: "all", extensionPointId: "org.bahmni.patient.search", type: "config", label: "All", order: 5, requiredPrivilege: "app:clinical", extensionParams: { translationKey: "MODULE_LABEL_ALL_KEY" } },
];

describe("legacy clinical patient search", () => {
  it("keeps the configured order and makes the first active queue the default", () => {
    const tabs = parseClinicalPatientSearchTabs(extensions, user);
    expect(tabs.map((tab) => tab.id)).toEqual(["active", "programs", "notifications", "all"]);
    expect(tabs[0]).toMatchObject({ handler: "emrapi.sqlSearch.activePatients", translationKey: "MODULE_LABEL_ACTIVE_KEY", searchColumns: ["identifier", "name"] });
    expect(tabs[2]).toMatchObject({ view: "custom", templateUrl: "/legacy.html" });
    expect(tabs[3]?.handler).toBeUndefined();
  });

  it("filters handler queues locally using the configured display columns", () => {
    const ana = normalizeClinicalPatient({ uuid: "p1", identifier: "RUN*1", name: "Ana Pérez" });
    const juan = normalizeClinicalPatient({ uuid: "p2", identifier: "RUN*2", givenName: "Juan", familyName: "Soto" });
    expect(filterClinicalPatients([ana, juan], "run*2").map((patient) => patient.uuid)).toEqual(["p2"]);
    expect(filterClinicalPatients([ana, juan], "ana").map((patient) => patient.uuid)).toEqual(["p1"]);
  });

  it("preserves active visit context and marks consultation destinations as pending", () => {
    const tab = parseClinicalPatientSearchTabs(extensions, user)[1]!;
    expect(clinicalPatientDestination(tab, { uuid: "p1", activeVisitUuid: "v1" })).toBe("/clinical/patient/p1/dashboard?visitUuid=v1&pending=consultation");
  });
});
