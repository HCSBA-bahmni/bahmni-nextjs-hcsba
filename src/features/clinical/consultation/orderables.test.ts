import { describe, expect, it } from "vitest";
import {
  configuredOrderableTemplates,
  orderableGroups,
  orderableIsIndirectlySelected,
  orderableMatchesSearch,
  orderableName,
  orderableParentMap,
} from "./orderables";
import type { ConsultationOrder } from "./types";

const allOrderables = {
  uuid: "all",
  name: { name: "All Orderables" },
  set: true,
  setMembers: [{
    uuid: "lab",
    name: { name: "Lab Samples" },
    names: [
      { name: "Laboratory", conceptNameType: "SHORT", locale: "en" },
      { name: "Lab Samples", conceptNameType: "FULLY_SPECIFIED", locale: "en" },
    ],
    set: true,
    setMembers: [{
      uuid: "blood",
      name: { name: "Blood" },
      names: [{ name: "Blood", conceptNameType: "FULLY_SPECIFIED" }],
      set: true,
      setMembers: [
        {
          uuid: "panel",
          name: { name: "CBC" },
          names: [{ name: "Hemogram", conceptNameType: "SHORT" }],
          conceptClass: { uuid: "panel-class", name: "LabSet", description: "Panels" },
          set: true,
          setMembers: [{ uuid: "hb", name: { name: "Hemoglobin" }, conceptClass: { name: "LabTest" }, setMembers: [] }],
        },
        {
          uuid: "hb",
          name: { name: "Hemoglobin" },
          names: [{ name: "Haemoglobin", conceptNameType: "SYNONYM" }],
          conceptClass: { uuid: "test-class", name: "LabTest", description: "Lab tests" },
          setMembers: [],
        },
        { uuid: "excluded", name: { name: "Procedure" }, conceptClass: { name: "Procedure" }, setMembers: [] },
      ],
    }],
  }],
};

describe("legacy All Orderables adapter", () => {
  it("uses the short display name while filtering by the default-locale fully specified name", () => {
    const templates = configuredOrderableTemplates(allOrderables, { "Lab Samples": ["LabSet", "LabTest"] });

    expect(orderableName(templates[0]!)).toBe("Laboratory");
    expect(templates[0]!.setMembers[0]!.setMembers.map((item) => item.uuid)).toEqual(["panel", "hb"]);
  });

  it("groups orderables by configured concept class and preserves their descriptions", () => {
    const category = configuredOrderableTemplates(allOrderables, {})[0]!.setMembers[0];

    expect(orderableGroups(category)).toEqual([
      { uuid: "panel-class", name: "LabSet", description: "Panels" },
      { uuid: "test-class", name: "LabTest", description: "Lab tests" },
      { uuid: undefined, name: "Procedure", description: undefined },
    ]);
  });

  it("searches full, short and synonym names without requesting a second endpoint", () => {
    const test = configuredOrderableTemplates(allOrderables, {})[0]!.setMembers[0]!.setMembers[1]!;

    expect(orderableMatchesSearch(test, "haemo")).toBe(true);
    expect(orderableMatchesSearch(test, "globin")).toBe(true);
    expect(orderableMatchesSearch(test, "random")).toBe(false);
  });

  it("marks a panel child active and read-only while the parent panel is selected", () => {
    const template = configuredOrderableTemplates(allOrderables, {})[0]!;
    const orders: ConsultationOrder[] = [{ clientId: "panel-order", concept: { uuid: "panel", name: "CBC" }, dirty: true }];

    expect(orderableIsIndirectlySelected(orders, "hb", orderableParentMap(template))).toBe(true);
    expect(orderableIsIndirectlySelected(orders, "excluded", orderableParentMap(template))).toBe(false);
  });
});
