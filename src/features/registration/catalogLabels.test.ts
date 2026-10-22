import { describe, expect, it } from "vitest";
import { patientCatalogLabel } from "./catalogLabels";
import { issuerCountryOption } from "./useIssuerCountries";
describe("registration catalog presentation", () => {
  it("removes known technical prefixes while preserving other catalog names", () => {
    expect(patientCatalogLabel("Sexo biológico EIS 2 - Mujer")).toBe("Mujer");
    expect(patientCatalogLabel("País ISO 3166-1 604 - PERÚ")).toBe("PERÚ");
    expect(patientCatalogLabel("Institución 123 - Clínica del Norte")).toBe("Institución 123 - Clínica del Norte");
  });
  it("takes issuer names and numeric values from the configured country catalog", () => {
    expect(issuerCountryOption("País ISO3166-1 604 - PERÚ")).toEqual({ code: "604", label: "PERÚ" });
    expect(issuerCountryOption("No se conoce")).toBeUndefined();
  });
});
