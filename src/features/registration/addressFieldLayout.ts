import type { AddressLevel } from "@/services/bahmni/address";

export type AddressKey = "address1" | "address2" | "address3" | "address4" | "address5" | "address6" | "cityVillage" | "countyDistrict" | "stateProvince" | "postalCode" | "country";

const addressKeys = new Set<AddressKey>([
  "address1", "address2", "address3", "address4", "address5", "address6",
  "cityVillage", "countyDistrict", "stateProvince", "postalCode", "country",
]);

const fallbackLevels: AddressLevel[] = [
  { addressField: "address1", name: "Dirección" },
  { addressField: "address2", name: "Complemento" },
];

export interface AddressFieldLayout extends AddressLevel {
  addressField: AddressKey;
  strictHierarchy: boolean;
}

export function buildAddressFieldLayout(
  levels: AddressLevel[],
  showTopDown = false,
  strictAutocompleteFromLevel?: string,
): AddressFieldLayout[] {
  const usingFallback = levels.length === 0;
  const source = usingFallback ? fallbackLevels : levels;
  const unique = source.filter((level, index) =>
    addressKeys.has(level.addressField as AddressKey)
    && source.findIndex((candidate) => candidate.addressField === level.addressField) === index);
  const strictIndex = strictAutocompleteFromLevel
    ? unique.findIndex((level) => level.addressField === strictAutocompleteFromLevel)
    : -1;
  const layout = unique.map((level, index) => ({
    ...level,
    addressField: level.addressField as AddressKey,
    strictHierarchy: strictIndex >= 0 && index <= strictIndex,
  }));
  return usingFallback || showTopDown ? layout : layout.reverse();
}
