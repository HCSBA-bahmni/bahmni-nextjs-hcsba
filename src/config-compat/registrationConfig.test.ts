import { describe, expect, it } from "vitest";
import { parseRegistrationConfig } from "./registrationConfig";

describe("registration descriptor", () => {
  it("extracts HCSBA print templates, attribute sections, workflow and search configuration", () => {
    const result = parseRegistrationConfig({ config: { patientInformation: { extra: { title: "Additional", attributes: ["email", "givenNameLocal"], order: 3 }, hidden: { attributes: ["primaryContact"] }, defaults: { email: "a@b.cl" } }, patientSearch: { customAttributes: { label: "Teléfono", fields: ["phoneNumber"] }, socialAttributes: { fields: ["givenNameLocal"] } }, relationshipTypeMap: { Doctor: "provider", Parent: "patient" }, printOptions: [{ translationKey: "LOCAL", templateUrl: "/registration/registrationCardLayout/print_local.html" }], showBirthTime: true, showStartVisitButton: false, enableDashboardRedirect: true, forwardUrlsForVisitTypes: [{ visitType: "OPD", forwardUrl: "/clinical/{{patientUuid}}", translationKey: "ENTER_OPD" }] } });
    expect(result.attributeNames).toEqual(["email", "givenNameLocal"]);
    expect(result.attributeDefaults).toEqual({ email: "a@b.cl" });
    expect(result.hiddenAttributeNames).toEqual(["primaryContact"]);
    expect(result.patientAttributeSections).toEqual([{ key: "extra", title: "Additional", translationKey: undefined, shortcutKey: undefined, order: 3, expanded: false, attributes: ["email", "givenNameLocal"] }]);
    expect(result.patientSearch.customAttributes.fields).toEqual(["phoneNumber"]);
    expect(result.relationshipTypeMap).toEqual({ Doctor: "provider", Parent: "patient" });
    expect(result.printOptions[0]).toMatchObject({ label: "LOCAL", templateUrl: "/registration/registrationCardLayout/print_local.html" });
    expect(result.showBirthTime).toBe(true);
    expect(result.showStartVisitButton).toBe(false);
    expect(result.enableDashboardRedirect).toBe(true);
    expect(result.forwardUrlsForVisitTypes).toEqual([{ visitType: "OPD", forwardUrl: "/clinical/{{patientUuid}}", translationKey: "ENTER_OPD", shortcutKey: undefined }]);
  });

  it("parses the EIS identity contract without executing remote rules", () => {
    const result = parseRegistrationConfig({ config: {
      showSecondLastName: true,
      isSecondLastNameMandatory: false,
      patientNameDisplayOrder: ["firstName", "lastName", "secondLastName"],
      mandatoryPersonAttributes: ["biologicalSex", "nationality"],
      prominentExtraIdentifierTypes: ["RUN"],
      onDemandExtraIdentifierTypes: ["Pasaporte"],
      hiddenExtraIdentifierTypes: ["Ficha clínica local"],
      repeatableExtraIdentifierTypes: ["Pasaporte"],
      fieldHelpText: { nationality: "HELP_NATIONALITY" },
      identifierHelpText: { RUN: "HELP_RUN" },
      identifierMetadata: {
        RUN: { typeCode: "1", use: "official", issuerCountryCode: "152" },
        Pasaporte: { typeCode: "4", use: "official", country: true, countryRequired: true, issuer: true, period: true },
        Invalid: { use: "official" },
      },
    } });
    expect(result.showSecondLastName).toBe(true);
    expect(result.patientNameDisplayOrder).toEqual(["firstName", "lastName", "secondLastName"]);
    expect(result.mandatoryAttributeNames).toEqual(["biologicalSex", "nationality"]);
    expect(result.prominentExtraIdentifierTypes).toEqual(["RUN"]);
    expect(result.onDemandExtraIdentifierTypes).toEqual(["Pasaporte"]);
    expect(result.hiddenExtraIdentifierTypes).toEqual(["Ficha clínica local"]);
    expect(result.repeatableExtraIdentifierTypes).toEqual(["Pasaporte"]);
    expect(result.fieldHelpText.nationality).toBe("HELP_NATIONALITY");
    expect(result.identifierHelpText.RUN).toBe("HELP_RUN");
    expect(result.identifierMetadata.Pasaporte).toMatchObject({ typeCode: "4", countryRequired: true, period: true });
    expect(result.identifierMetadata.Invalid).toBeUndefined();
  });
});
