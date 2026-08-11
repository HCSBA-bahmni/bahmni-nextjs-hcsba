import { describe, expect, it } from "vitest";
import { normalizePatientSearchResult } from "./patients";

describe("patient search response", () => {
  it("normalizes the Bahmni search wire format", () => {
    expect(normalizePatientSearchResult({ uuid: "p1", identifier: "12-3", name: "Ana Pérez", age: "36", customAttribute: '{"phoneNumber":"555"}', addressFieldValue: '{"cityVillage":"Santiago"}' })).toMatchObject({ uuid: "p1", identifier: "12-3", givenName: "Ana", familyName: "Pérez", phoneNumber: "555", address: "Santiago" });
  });
});
