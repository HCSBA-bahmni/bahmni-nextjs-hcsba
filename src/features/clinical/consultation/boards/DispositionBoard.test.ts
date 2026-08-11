import { describe, expect, it } from "vitest";
import { dispositionCode, filterDispositionActions } from "./DispositionBoard";

const actions = ["OTHER", "UNDO_DISCHARGE", "ADMIT", "TRANSFER", "DISCHARGE"].map((code) => ({ code, name: code }));

describe("legacy disposition visibility", () => {
  it("reads the disposition code from the emrapi mapping display returned by OpenMRS", () => {
    expect(dispositionCode({
      name: { name: "Transfer Patient" },
      mappings: [{ display: "org.openmrs.module.emrapi: TRANSFER" }],
    })).toBe("TRANSFER");
  });

  it("filters the real OpenMRS mapping shape for an admitted patient", () => {
    const mappedActions = ["UNDO_DISCHARGE", "ADMIT", "TRANSFER", "DISCHARGE"].map((code) => ({
      name: { name: code },
      mappings: [{ display: `org.openmrs.module.emrapi: ${code}` }],
    }));
    expect(filterDispositionActions(mappedActions, { admissionDetails: { uuid: "admission" } }, true).map(dispositionCode)).toEqual(["TRANSFER", "DISCHARGE"]);
  });

  it("offers admission for a patient who is not admitted", () => {
    expect(filterDispositionActions(actions, {}, true).map((action) => action.code)).toEqual(["OTHER", "ADMIT"]);
  });

  it("offers transfer and discharge for an open admitted visit", () => {
    expect(filterDispositionActions(actions, { admissionDetails: { uuid: "admission" } }, true).map((action) => action.code)).toEqual(["OTHER", "TRANSFER", "DISCHARGE"]);
  });

  it("offers undo discharge for an open discharged visit", () => {
    expect(filterDispositionActions(actions, { dischargeDetails: { uuid: "discharge" } }, true).map((action) => action.code)).toEqual(["OTHER", "UNDO_DISCHARGE"]);
  });
});
