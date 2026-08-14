import { describe, expect, it } from "vitest";
import { fulfillmentConceptNames, fulfillmentFormMembers, resolveOrderTypeUuid } from "./fulfillment";

describe("legacy order fulfillment configuration", () => {
  it("resolves the order type by the exact legacy display name", () => {
    const types = [{ uuid: "lab", display: "Lab Order" }, { uuid: "radiology", display: "Radiology Order" }];
    expect(resolveOrderTypeUuid(types, "Radiology Order")).toBe("radiology");
    expect(resolveOrderTypeUuid(types, "radiology order")).toBeUndefined();
  });
  it("uses the direct members of the configured fulfillment concept set", () => {
    expect(fulfillmentConceptNames({ setMembers: [{ uuid: "notes", name: { name: "Radiology Notes" } }, { uuid: "result", name: { display: "Radiology Result" } }] })).toEqual(["Radiology Notes", "Radiology Result"]);
  });
  it("preserves datatype and concept class instead of guessing controls from labels", () => {
    expect(fulfillmentFormMembers({ setMembers: [
      { uuid: "notes", name: { display: "Radiology Notes" }, datatype: { name: "Text" }, conceptClass: { name: "Finding" } },
      { uuid: "image", name: { display: "Image" }, datatype: { name: "Complex" }, conceptClass: { name: "Image" } },
    ] })).toEqual([
      { uuid: "notes", label: "Radiology Notes", datatype: "Text", conceptClass: "Finding" },
      { uuid: "image", label: "Image", datatype: "Complex", conceptClass: "Image" },
    ]);
  });
});
