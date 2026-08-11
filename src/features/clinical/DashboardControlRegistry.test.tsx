import { describe, expect, it } from "vitest";
import { dashboardControlTypes, getDashboardControlAdapter } from "./DashboardControlRegistry";

describe("dashboard control registry", () => {
  it("registers every control type configured by HCSBA", () => {
    expect([...dashboardControlTypes]).toEqual(expect.arrayContaining([
      "patientInformation", "allergies", "formsV2React", "ipsReact", "ipsIcvpReact", "diagnosis", "custom", "navigationLinksControl", "disposition", "treatment", "radiology", "programs", "ordersControl", "pacsOrders", "bacteriologyResultsControl", "labOrders", "observation", "flowSheet", "vitals", "visits", "admissionDetails", "conditionsList", "forms", "obsToObsFlowSheet", "allOrdersReact", "observationGraph", "historyAndExamination", "drugOrderDetails", "chronicTreatmentChart",
    ]));
  });

  it("never falls back to an observation adapter for an unknown type", () => {
    const adapter = getDashboardControlAdapter("unknown-control");
    expect(adapter.type).toBe("unknown-control");
    expect(adapter.capabilities).toEqual([]);
  });

  it("exposes the allergy write action as an explicit adapter capability", () => {
    const adapter = getDashboardControlAdapter("allergies");
    expect(adapter.capabilities).toEqual(["read", "edit"]);
    expect(adapter.HeaderAction).toBeDefined();
  });
});
