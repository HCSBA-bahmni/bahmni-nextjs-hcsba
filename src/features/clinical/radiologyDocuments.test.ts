import { describe, expect, it } from "vitest";
import { mapRadiologyDocuments } from "./radiologyDocuments";

describe("legacy radiology document mappers", () => {
  it("flattens image observations, groups by parent concept and sorts newest first", () => {
    const groups = mapRadiologyDocuments([{ uuid: "enc", provider: { display: "Dr Test" }, visit: { uuid: "visit", startDatetime: 1 }, obs: [{ concept: { name: "Chest X-ray" }, groupMembers: [{ uuid: "old", obsDatetime: 1, value: "old.jpg" }, { uuid: "new", obsDatetime: 2, value: "new.pdf", comment: "Report" }] }] }]);
    expect(groups[0]?.conceptName).toBe("Chest X-ray");
    expect(groups[0]?.documents.map((document) => document.value)).toEqual(["new.pdf", "old.jpg"]);
    expect(groups[0]?.documents[0]).toEqual(expect.objectContaining({ comment: "Report", provider: "Dr Test", visitUuid: "visit", visitActive: true }));
  });

  it("filters by configured visit UUIDs", () => {
    expect(mapRadiologyDocuments([{ visit: { uuid: "other" }, obs: [{ concept: { name: "X" }, groupMembers: [{ value: "x.jpg" }] }] }], ["selected"])).toEqual([]);
  });
});
