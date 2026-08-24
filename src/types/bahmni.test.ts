import { describe, expect, it } from "vitest";
import { referenceSchema } from "./bahmni";

describe("OpenMRS reference contract", () => {
  it("normalizes REST custom-representation names and nullable relationship names", () => {
    expect(referenceSchema.parse({ uuid: "concept-1", display: "Femenino", name: { display: "Femenino" } }))
      .toMatchObject({ uuid: "concept-1", display: "Femenino", name: "Femenino" });
    expect(referenceSchema.parse({ uuid: "relationship-1", display: "Representa legalmente a", name: null }))
      .toMatchObject({ uuid: "relationship-1", display: "Representa legalmente a", name: undefined });
  });
});
