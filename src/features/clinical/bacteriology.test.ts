import { describe, expect, it } from "vitest";
import { mapBacteriologySpecimens } from "./bacteriology";

describe("legacy specimen mapper", () => {
  it("maps source, identifier, collection date and nested report results", () => {
    const [specimen] = mapBacteriologySpecimens([{ uuid: "specimen", identifier: "138", dateCollected: "2016-03-14", type: { name: "blood" }, report: { results: { concept: { name: "Bacteriology Results" }, groupMembers: [{ concept: { name: "Smear result" }, value: "Negative" }] } } }]);
    expect(specimen).toEqual(expect.objectContaining({ uuid: "specimen", identifier: "138", source: "blood", collectedAt: "2016-03-14" }));
    expect(specimen?.results[0]?.groupMembers).toEqual([expect.objectContaining({ value: "Negative" })]);
  });

  it("uses free text for the configured Other Sample type", () => {
    expect(mapBacteriologySpecimens([{ type: { shortName: "Other Sample" }, typeFreeText: "Catheter" }])[0]?.source).toBe("Catheter");
  });
});
