import { describe, expect, it } from "vitest";
import { configuredAdtActionCodes } from "./adtRules";

describe("ADT legacy rules", () => {
  it("offers undo discharge only when a discharged visit remains open", () => {
    expect(configuredAdtActionCodes({ dischargeDetails: { uuid: "discharge" }, stopDateTime: null })).toEqual(["UNDO_DISCHARGE"]);
  });
  it("offers transfer and discharge only when an open visit has a current bed", () => {
    expect(configuredAdtActionCodes({ admissionDetails: { uuid: "admission" }, stopDateTime: null }, true)).toEqual(["TRANSFER", "DISCHARGE"]);
  });
  it("offers admission to complete bed assignment when an admitted patient has no current bed", () => {
    expect(configuredAdtActionCodes({ admissionDetails: { uuid: "admission" }, stopDateTime: null }, false)).toEqual(["ADMIT"]);
  });
  it("offers admission when a discharged visit is closed", () => {
    expect(configuredAdtActionCodes({ dischargeDetails: { uuid: "discharge" }, stopDateTime: "2026-08-07" })).toEqual(["ADMIT"]);
  });
});
