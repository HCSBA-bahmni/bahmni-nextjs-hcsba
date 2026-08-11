import { describe, expect, it } from "vitest";
import { activeConsultationRoute, patientAdtUrl, resolveClinicalNavigationLinks } from "./navigationLinks";

describe("legacy dashboard navigation links", () => {
  it("keeps configured order, ignores unknown standard links and requires visit context", () => {
    const links = resolveClinicalNavigationLinks({ showLinks: ["home", "visit", "labEntry", "registration"] }, "patient/1");
    expect(links.map((link) => link.name)).toEqual(["home", "registration"]);
    expect(links[1]?.href).toBe("/registration/patient/patient%2F1");
  });

  it("uses the migrated ADT route while retaining other legacy and custom links", () => {
    const links = resolveClinicalNavigationLinks({ showLinks: ["inpatient", "enrolment"], customLinks: [{ name: "external", title: "Portal", url: "https://portal.example/patient/{{patientUuid}}" }] }, "p1", "v1");
    expect(links).toEqual([
      expect.objectContaining({ name: "inpatient", href: "/adt/patient/p1/visit/v1", internal: true }),
      expect.objectContaining({ name: "enrolment", href: "/bahmni/clinical/index.html#/programs/patient/p1/consultationContext", internal: false }),
      expect.objectContaining({ name: "external", href: "https://portal.example/patient/p1", internal: false }),
    ]);
  });

  it("normalizes the configured legacy bed-management hash to the canonical Next route", () => {
    const [link] = resolveClinicalNavigationLinks({ customLinks: [{ name: "bedManagement", translationKey: "PATIENT_BED_MANAGEMENT_PAGE_KEY", url: "../bedmanagement/#/bedManagement/patient/{{patientUuid}}" }] }, "p1", "v1");
    expect(link).toMatchObject({ name: "bedManagement", href: "/bedmanagement/patient/p1?visitUuid=v1", internal: true });
  });

  it("builds the canonical Next ADT route used by the bed shortcut", () => {
    expect(patientAdtUrl("patient/1", "visit 1")).toBe("/adt/patient/patient%2F1/visit/visit%201");
  });

  it("opens the active consultation instead of starting an implicit new encounter", () => {
    expect(activeConsultationRoute("patient", "visit", "enrollment")).toEqual({
      pathname: "/clinical/patient/patient/consultation/observations",
      query: { encounterUuid: "active", visitUuid: "visit", configName: "programs", enrollment: "enrollment" },
    });
  });
});
