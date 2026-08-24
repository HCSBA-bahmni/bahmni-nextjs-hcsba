import { describe, expect, it } from "vitest";
import type { PersonAttributeType } from "@/services/bahmni/metadata";
import { requiredPatientAttributeConceptUuids } from "./useRequiredPatientAttributeCatalogs";

const codedAttribute = (name: string, conceptUuid: string): PersonAttributeType => ({
  uuid: `attribute-${name}`,
  name,
  concept: { uuid: conceptUuid, display: name },
});

describe("required patient attribute catalogs", () => {
  it("selects only concept catalogs required by dynamic registration configuration", () => {
    const attributes = [
      codedAttribute("nationality", "nationality-concept"),
      codedAttribute("countryOfOrigin", "origin-concept"),
      codedAttribute("optionalCatalog", "optional-concept"),
      { uuid: "email-attribute", name: "email", format: "java.lang.String" },
    ];

    expect(requiredPatientAttributeConceptUuids(attributes, ["nationality", "countryOfOrigin", "email"])).toEqual([
      "nationality-concept",
      "origin-concept",
    ]);
  });

  it("deduplicates a shared OpenMRS concept catalog", () => {
    const attributes = [codedAttribute("first", "shared-concept"), codedAttribute("second", "shared-concept")];
    expect(requiredPatientAttributeConceptUuids(attributes, ["first", "second"])).toEqual(["shared-concept"]);
  });
});
