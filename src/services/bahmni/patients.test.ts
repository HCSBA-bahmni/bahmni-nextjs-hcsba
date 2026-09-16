import { describe, expect, it } from "vitest";
import { isPatientImageDataUrl, normalizePatientSearchResult, patientImageUrl } from "./patients";

describe("patient search response", () => {
  it("normalizes the Bahmni search wire format", () => {
    expect(normalizePatientSearchResult({ uuid: "p1", identifier: "12-3", name: "Ana Pérez", age: "36", customAttribute: '{"phoneNumber":"555"}', addressFieldValue: '{"cityVillage":"Santiago"}' })).toMatchObject({ uuid: "p1", identifier: "12-3", givenName: "Ana", familyName: "Pérez", phoneNumber: "555", address: "Santiago" });
  });
});

describe("patient image", () => {
  it("builds the authenticated OpenMRS image URL", () => {
    expect(patientImageUrl("patient/1", "refresh-token")).toBe("/openmrs/ws/rest/v1/patientImage?patientUuid=patient%2F1&q=refresh-token");
  });

  it("distinguishes a newly captured image from the persisted image URL", () => {
    expect(isPatientImageDataUrl("data:image/jpeg;base64,QUJD")).toBe(true);
    expect(isPatientImageDataUrl(patientImageUrl("p1"))).toBe(false);
  });
});
