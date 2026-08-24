import { describe, expect, it } from "vitest";
import { LAST_PATIENT_FORM_STEP, PATIENT_FORM_STEPS, patientFormStepForErrorKeys } from "./patientFormSteps";

describe("patient registration steps", () => {
  it("defines the three EIS registration stages", () => {
    expect(PATIENT_FORM_STEPS.map((step) => step.label)).toEqual([
      "Identificación y datos personales",
      "Dirección",
      "Información adicional",
    ]);
    expect(LAST_PATIENT_FORM_STEP).toBe(2);
  });

  it("routes identity and address errors to their corresponding stage", () => {
    expect(patientFormStepForErrorKeys(["givenName"])).toBe(0);
    expect(patientFormStepForErrorKeys(["birthDate"])).toBe(0);
    expect(patientFormStepForErrorKeys(["country"])).toBe(1);
    expect(patientFormStepForErrorKeys(["address2"])).toBe(1);
  });

  it("routes configured attributes, identifiers and relationships to the final stage", () => {
    expect(patientFormStepForErrorKeys(["additionalIdentifiers.0"])).toBe(2);
    expect(patientFormStepForErrorKeys(["attribute-uuid"])).toBe(2);
    expect(patientFormStepForErrorKeys(["relationships"])).toBe(2);
  });

  it("prioritizes the earliest stage when errors span the form", () => {
    expect(patientFormStepForErrorKeys(["attribute-uuid", "country", "givenName"])).toBe(0);
    expect(patientFormStepForErrorKeys(["attribute-uuid", "country"])).toBe(1);
  });
});
