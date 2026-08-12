import { describe, expect, it } from "vitest";
import { parseClinicalVisitConfig } from "./visitConfig";

describe("clinical visit configuration parity", () => {
  it("merges mandatory sections into the configured default tab and scopes every control to the visit", () => {
    const [general] = parseClinicalVisitConfig({ general: { displayByDefault: true, defaultSections: true, sections: {
      pivot: { type: "pivotTable", displayOrder: 0, title: "Vitals" },
      labs: { type: "labOrders", displayOrder: 2, config: { translationKey: "CUSTOM_LABS", showTable: false } },
      conditions: { type: "conditionsList", displayOrder: 1 },
    } } }, "patient", "visit");

    expect(general?.sections.map((section) => section.type)).toEqual([
      "patientInformation", "flowSheet", "diagnosis", "conditionsList", "observation", "labOrders", "disposition", "admissionDetails", "treatment", "radiology", "patientFiles",
    ]);
    expect(general?.sections[0]).toMatchObject({ id: "Patient Information", translationKey: "VISIT_TITLE_PATIENT_INFORMATION" });
    expect(general?.sections.find((section) => section.id === "pivot")).toMatchObject({ type: "flowSheet", hideEmptyDisplayControl: true });
    const labs = general?.sections.find((section) => section.id === "labs");
    expect(labs).toMatchObject({ translationKey: "CUSTOM_LABS", config: { patientUuid: "patient", visitUuids: ["visit"], showTable: false } });
  });

  it("normalizes visit-only aliases without adding mandatory sections to secondary tabs", () => {
    const tabs = parseClinicalVisitConfig({ general: { defaultSections: true, sections: {} }, discharge: { sections: {
      prescription: { type: "prescription", config: { showProvider: false } },
      orders: { type: "order", config: { orderType: "Radiology Order" } },
    } } }, "patient", "visit");
    expect(tabs[1]?.sections.map((section) => section.type)).toEqual(["treatment", "ordersControl"]);
    expect(tabs[1]?.sections.every((section) => Array.isArray(section.config.visitUuids) && section.config.visitUuids[0] === "visit")).toBe(true);
  });
});
