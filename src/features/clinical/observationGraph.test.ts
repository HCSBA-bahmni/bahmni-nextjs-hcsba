import { describe, expect, it } from "vitest";
import { differenceInMonths, parseObservationGraphReference } from "./observationGraph";

describe("legacy observation graph reference", () => {
  it("converts CSV columns into gender/age-filtered percentile lines", () => {
    const csv = "Gender,Age,3rd,10th\nM,01,2.3,2.7\nM,11,3.8,4.8\nM,14,3.9,4.0\nF,02,3.4,3.7";
    const lines = parseObservationGraphReference(csv, "M", 10);
    expect(lines.map((line) => line.name)).toEqual(["3rd", "10th"]);
    expect(lines[0]?.points.map((point) => point.y)).toEqual([2.3, 3.8]);
    expect(lines.every((line) => line.points.every((point) => point.reference))).toBe(true);
  });

  it("ports Bahmni's years/months/days divided by 30 age calculation", () => {
    expect(differenceInMonths("2025-01-01", "2026-03-16")).toBe(14.5);
  });

  it("rejects malformed reference files instead of drawing incorrect curves", () => {
    expect(() => parseObservationGraphReference("Sex,Months,P50\nM,1,3", "M", 1)).toThrow("Age column");
  });
});
