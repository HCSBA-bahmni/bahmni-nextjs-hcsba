import { describe, expect, it } from "vitest";
import { clinicalMfeManifest, findClinicalMfe, hostedClinicalMfeTypes } from "./manifest";

describe("clinical microfrontend manifest", () => {
  it("traces every React dashboard component configured by HCSBA", () => {
    expect(clinicalMfeManifest.map((entry) => entry.sectionType)).toEqual(expect.arrayContaining(["allergies", "formsV2React", "ipsReact", "ipsIcvpReact", "allOrdersReact"]));
  });

  it("only hosts adapters that have been ported at least partially", () => {
    expect(hostedClinicalMfeTypes.has("formsV2React")).toBe(true);
    expect(hostedClinicalMfeTypes.has("allOrdersReact")).toBe(true);
    expect(findClinicalMfe("formsV2React")).toMatchObject({ legacyComponent: "FormDisplayControl", status: "ported" });
  });
});
