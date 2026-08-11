import { describe, expect, it } from "vitest";
import { configuredAdtActionCodes, hasAssignedBedFlag } from "./adtRules";

describe("ADT legacy rules", () => {
  it("offers undo discharge only when a discharged visit remains open", () => {
    expect(configuredAdtActionCodes({ dischargeDetails: { uuid: "discharge" }, stopDateTime: null })).toEqual(["UNDO_DISCHARGE"]);
  });
  it("offers transfer and discharge for an admitted open visit", () => {
    expect(configuredAdtActionCodes({ admissionDetails: { uuid: "admission" }, stopDateTime: null })).toEqual(["TRANSFER", "DISCHARGE"]);
  });
  it("offers admission when a discharged visit is closed", () => {
    expect(configuredAdtActionCodes({ dischargeDetails: { uuid: "discharge" }, stopDateTime: "2026-08-07" })).toEqual(["ADMIT"]);
  });
  it("uses the Angular patient tile hasBeenAdmitted values", () => {
    expect(hasAssignedBedFlag({ hasBeenAdmitted: true })).toBe(true);
    expect(hasAssignedBedFlag({ hasBeenAdmitted: "true" })).toBe(true);
    expect(hasAssignedBedFlag({ hasBeenAdmitted: false })).toBe(false);
  });
});
