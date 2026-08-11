import { describe, expect, it } from "vitest";
import { bacteriologyConceptSetByClass, bacteriologySampleOptions, isSpecimenEmpty, specimenNeedsSave } from "./bacteriology";

describe("bacteriology consultation parity", () => {
  const source = {
    setMembers: [
      {
        uuid: "sample-source",
        name: { name: "Specimen Sample Source" },
        answers: [
          { uuid: "blood", name: { name: "Blood Specimen" }, names: [{ name: "Blood", conceptNameType: "SHORT" }] },
          { uuid: "blood", name: { name: "Blood Specimen" }, names: [{ name: "Blood", conceptNameType: "SHORT" }] },
          { uuid: "urine", name: { name: "Urine" } },
        ],
      },
      { uuid: "attributes", name: { name: "Attributes" }, conceptClass: { name: "Bacteriology Attributes" } },
    ],
  };

  it("deduplicates the malformed legacy sample options by concept UUID", () => {
    expect(bacteriologySampleOptions(source)).toEqual([
      expect.objectContaining({ label: "Blood", value: expect.objectContaining({ uuid: "blood" }) }),
      expect.objectContaining({ label: "Urine", value: expect.objectContaining({ uuid: "urine" }) }),
    ]);
  });

  it("selects configured groups by concept class", () => {
    expect(bacteriologyConceptSetByClass(source, "Bacteriology Attributes")).toMatchObject({ uuid: "attributes" });
  });

  it("does not serialize the blank specimen that legacy creates by default", () => {
    const blank = { clientId: "blank" };
    expect(isSpecimenEmpty(blank)).toBe(true);
    expect(specimenNeedsSave(blank)).toBe(false);
    expect(specimenNeedsSave({ ...blank, identifier: "sample-1", dirty: true })).toBe(true);
  });
});
