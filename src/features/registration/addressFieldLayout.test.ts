import { describe, expect, it } from "vitest";
import type { AddressLevel } from "@/services/bahmni/address";
import { buildAddressFieldLayout } from "./addressFieldLayout";

const eisLevels: AddressLevel[] = [
  { addressField: "country", name: "País", required: true },
  { addressField: "stateProvince", name: "Región", required: true },
  { addressField: "countyDistrict", name: "Provincia", required: true },
  { addressField: "cityVillage", name: "Comuna", required: true },
  { addressField: "address4", name: "Tipo de vía" },
  { addressField: "address1", name: "Nombre de vía" },
  { addressField: "address2", name: "Número" },
  { addressField: "address3", name: "Complemento" },
  { addressField: "postalCode", name: "Código postal" },
];

describe("EIS patient address layout", () => {
  it("renders all configured fields in top-down order and limits hierarchy lookup to territory", () => {
    const result = buildAddressFieldLayout(eisLevels, true, "cityVillage");
    expect(result.map(({ addressField, name }) => ({ addressField, name })))
      .toEqual(eisLevels.map(({ addressField, name }) => ({ addressField, name })));
    expect(result.filter((field) => field.strictHierarchy).map((field) => field.addressField))
      .toEqual(["country", "stateProvince", "countyDistrict", "cityVillage"]);
  });

  it("retains the legacy two-field fallback when OpenMRS has no address metadata", () => {
    expect(buildAddressFieldLayout([])).toMatchObject([
      { addressField: "address1", name: "Dirección", strictHierarchy: false },
      { addressField: "address2", name: "Complemento", strictHierarchy: false },
    ]);
  });

  it("reverses the configured order when top-down display is disabled", () => {
    expect(buildAddressFieldLayout(eisLevels, false, "cityVillage")[0]?.addressField).toBe("postalCode");
  });
});
