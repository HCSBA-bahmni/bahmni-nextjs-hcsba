import { describe, expect, it } from "vitest";
import { parseClinicalDashboardConfig } from "./clinicalConfig";

describe("clinical dashboard configuration parity", () => {
  it("keeps configured tabs, privileges and display order", () => {
    const tabs = parseClinicalDashboardConfig({ general: { translationKey: "GENERAL", displayByDefault: true, sections: {
      visits: { type: "visits", displayOrder: 7 },
      diagnosis: { type: "diagnosis", displayOrder: 1, requiredPrivilege: "View Diagnoses" },
    } } });
    expect(tabs[0]).toMatchObject({ id: "general", translationKey: "GENERAL", displayByDefault: true });
    expect(tabs[0]?.sections.map((section) => section.id)).toEqual(["diagnosis", "visits"]);
    expect(tabs[0]?.sections[0]?.requiredPrivilege).toBe("View Diagnoses");
  });

  it("preserves layout, expanded configuration and stable order for equal positions", () => {
    const tabs = parseClinicalDashboardConfig({ general: { sections: {
      first: { type: "observation", displayOrder: 2, displayType: "Full-Page", dashboardConfig: { numberOfVisits: 2 }, expandedViewConfig: { numberOfVisits: 10 }, formGroup: ["Vitals"] },
      second: { type: "visits", displayOrder: 2, config: { allowGeneration: true } },
    } } });
    expect(tabs[0]?.sections.map((section) => section.id)).toEqual(["first", "second"]);
    expect(tabs[0]?.sections[0]).toMatchObject({ sourceIndex: 0, displayType: "Full-Page", dashboardConfig: { numberOfVisits: 2 }, expandedViewConfig: { numberOfVisits: 10 }, formGroup: ["Vitals"] });
    expect(tabs[0]?.sections[1]?.config).toEqual({ allowGeneration: true });
  });

  it("uses the legacy allFlowSheetDetails contract as the expanded configuration", () => {
    const tabs = parseClinicalDashboardConfig({ general: { sections: {
      vitals: { type: "flowSheet", dashboardConfig: { latestCount: 5 }, allFlowSheetDetails: { latestCount: 10 } },
    } } });
    expect(tabs[0]?.sections[0]?.expandedViewConfig).toEqual({ latestCount: 10 });
  });
});
