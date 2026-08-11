import { describe, expect, it } from "vitest";
import type { PersonAttributeType } from "@/services/bahmni/metadata";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { buildPatientAttributeLayout, patientAttributeTranslationKey } from "./patientAttributeLayout";

const attribute = (name: string): PersonAttributeType => ({ uuid: `uuid-${name}`, name, display: name });

describe("legacy patient attribute layout", () => {
  it("separates configured sections, hidden fields, local names and other information", () => {
    const config = parseRegistrationConfig({ config: { patientInformation: {
      additionalPatientInformation: { title: "Additional Patient Information", attributes: ["email"], order: 2 },
      hidden: { attributes: ["primaryContact"] }, defaults: { email: "test@hcsba.cl" },
    } } });
    const result = buildPatientAttributeLayout([
      attribute("givenNameLocal"), attribute("middleNameLocal"), attribute("familyNameLocal"),
      attribute("phoneNumber"), attribute("alternatePhoneNumber"), attribute("email"), attribute("primaryContact"),
    ], config);
    expect(result.localNames.map((item) => item.name)).toEqual(["givenNameLocal", "middleNameLocal", "familyNameLocal"]);
    expect(result.otherInformation.map((item) => item.name)).toEqual(["phoneNumber", "alternatePhoneNumber"]);
    expect(result.configuredSections[0]).toMatchObject({ config: { key: "additionalPatientInformation", order: 2 }, attributes: [{ name: "email" }] });
  });

  it("hides incomplete local-name triplets like Angular", () => {
    const result = buildPatientAttributeLayout([attribute("middleNameLocal"), attribute("familyNameLocal"), attribute("email")]);
    expect(result.localNames).toEqual([]);
    expect(result.otherInformation.map((item) => item.name)).toEqual(["email"]);
  });

  it("derives the same translation key normalization as legacy", () => {
    expect(patientAttributeTranslationKey("Mother's LastName")).toBe("PATIENT_ATTRIBUTE_MOTHERS_LASTNAME");
  });
});
