import { describe, expect, it } from "vitest";
import { parseIpdConfig } from "@/config-compat/ipdConfig";
import { toClinicalIpdDashboardTab } from "./dashboard";

describe("IPD dashboard configuration adapter", () => {
  it("keeps legacy order and hands each type to the shared React control registry", () => {
    const config = parseIpdConfig({ config: { dashboard: {
      translationKey: "DASHBOARD_TAB_GENERAL_KEY",
      conceptName: "Adt Notes",
      sections: {
        admission: { type: "admissionDetails", translationKey: "ADMISSION", displayOrder: 3 },
        vitals: { type: "vitals", translationKey: "VITALS", displayOrder: 2, dashboardConfig: { conceptNames: ["Weight"] }, expandedViewConfig: { numberOfVisits: 3 } },
        patient: { type: "patientInformation", translationKey: "PATIENT", displayOrder: 0, patientAttributes: ["occupation"] },
      },
    } } });

    const tab = toClinicalIpdDashboardTab(config.dashboard);
    expect(tab?.translationKey).toBe("DASHBOARD_TAB_GENERAL_KEY");
    expect(tab?.sections.map((section) => section.id)).toEqual(["patient", "vitals", "admission"]);
    expect(tab?.sections[0]?.raw.patientAttributes).toEqual(["occupation"]);
    expect(tab?.sections[1]).toMatchObject({ type: "vitals", dashboardConfig: { conceptNames: ["Weight"] }, expandedViewConfig: { numberOfVisits: 3 } });
  });
});
