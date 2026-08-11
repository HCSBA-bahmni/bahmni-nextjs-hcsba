import { describe, expect, it } from "vitest";
import { groupLabAccessions, isAbnormalLabResult, labResultFor, labTabularModel, normalRange } from "./labResults";

describe("legacy lab result rules", () => {
  it("groups accessions newest-first and nests tests under panels", () => {
    const grouped = groupLabAccessions([
      { accessionUuid: "old", accessionDateTime: 100, testName: "A" },
      { accessionUuid: "new", accessionDateTime: 200, testName: "B", panelName: "Blood" },
      { accessionUuid: "new", accessionDateTime: 200, testName: "C", panelName: "Blood" },
    ]);
    expect(grouped.map((item) => item.uuid)).toEqual(["new", "old"]);
    expect(grouped[0]?.items[0]).toEqual(expect.objectContaining({ kind: "panel", name: "Blood", tests: expect.arrayContaining([expect.objectContaining({ testName: "B" })]) }));
  });

  it("preserves the initial/latest accession union used by AngularJS", () => {
    const grouped = groupLabAccessions([1, 2, 3, 4].map((date) => ({ accessionUuid: `a${date}`, accessionDateTime: date })), { initialAccessionCount: 1, latestAccessionCount: 2 });
    expect(grouped.map((item) => item.uuid)).toEqual(["a4", "a3", "a1"]);
  });

  it("detects configured ranges including zero boundaries", () => {
    expect(normalRange({ minNormal: 0, maxNormal: 6 })).toBe("0 – 6");
    expect(isAbnormalLabResult({ result: "7", minNormal: 0, maxNormal: 6 })).toBe(true);
    expect(isAbnormalLabResult({ result: "4", minNormal: 0, maxNormal: 6 })).toBe(false);
  });

  it("filters unused tabular labels and sorts latest first", () => {
    const model = labTabularModel({ tabularResult: { dates: [{ index: 1, date: "2026-08-01" }, { index: 2, date: "2026-08-02" }], orders: [{ index: 3, testName: "A" }, { index: 4, testName: "B" }], values: [{ dateIndex: 2, testOrderIndex: 4, result: "10" }] } }, true);
    expect(model.dates.map((item) => item.index)).toEqual([2]);
    expect(model.orders.map((item) => item.index)).toEqual([4]);
    expect(labResultFor(model, 2, 4)[0]?.result).toBe("10");
  });
});
