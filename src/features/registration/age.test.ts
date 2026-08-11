import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { ageFromBirthDate, birthDateFromAge } from "./age";

const reference = DateTime.fromISO("2026-08-03");

describe("legacy registration age rules", () => {
  it("calculates years, months and days when a birth date is selected", () => {
    expect(ageFromBirthDate("1996-06-28", reference)).toEqual({ years: 30, months: 1, days: 6 });
  });

  it("calculates the estimated birth date in the same order as Bahmni", () => {
    expect(birthDateFromAge({ years: 30, months: 1, days: 6 }, reference)).toBe("1996-06-28");
  });

  it("rejects future dates", () => {
    expect(ageFromBirthDate("2026-08-04", reference)).toBeUndefined();
  });
});
