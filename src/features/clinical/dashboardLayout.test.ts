import { describe, expect, it } from "vitest";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import { createDashboardLayout } from "./dashboardLayout";

function section(id: string, displayType: ClinicalDashboardSection["displayType"] = "Half-Page"): ClinicalDashboardSection {
  return {
    id,
    title: id,
    type: "observation",
    displayType,
    sourceIndex: 0,
    dashboardConfig: {},
    expandedViewConfig: {},
    config: {},
    formGroup: [],
    raw: {},
  };
}

describe("createDashboardLayout", () => {
  it("mantiene el orden configurado al alternar las columnas", () => {
    const blocks = createDashboardLayout([
      section("patientInformation"), section("diagnosis"), section("allergies"),
      section("navigation"), section("treatments"),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "columns",
      left: [
        { section: { id: "patientInformation" }, layoutOrder: 0 },
        { section: { id: "allergies" }, layoutOrder: 2 },
        { section: { id: "treatments" }, layoutOrder: 4 },
      ],
      right: [
        { section: { id: "diagnosis" }, layoutOrder: 1 },
        { section: { id: "navigation" }, layoutOrder: 3 },
      ],
    });
  });

  it("respeta Full-Page como corte y reinicia la alternancia", () => {
    const blocks = createDashboardLayout([
      section("left"), section("right"), section("full", "Full-Page"),
      section("next-left"), section("next-right"),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["columns", "full", "columns"]);
    expect(blocks[1]).toMatchObject({ kind: "full", item: { section: { id: "full" }, layoutOrder: 2 } });
    expect(blocks[2]).toMatchObject({
      kind: "columns",
      left: [{ section: { id: "next-left" }, layoutOrder: 3 }],
      right: [{ section: { id: "next-right" }, layoutOrder: 4 }],
    });
  });
});
