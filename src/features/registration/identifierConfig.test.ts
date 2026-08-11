import { describe, expect, it } from "vitest";
import { composeIdentifier, identifierSuffix, selectIdentifierSource, validateConfiguredIdentifier } from "./identifierConfig";

const type = { uuid: "type", name: "Patient Identifier", primary: true, required: true, identifierSources: [{ uuid: "cl", name: "CL", prefix: "CL" }, { uuid: "rut", name: "RUT*", prefix: "RUT*" }] };

describe("OpenMRS identifier configuration", () => {
  it("selects the configured prefix and falls back like AngularJS", () => {
    expect(selectIdentifierSource(type, "RUT*")?.uuid).toBe("rut");
    expect(selectIdentifierSource(type, "missing")?.uuid).toBe("cl");
  });
  it("composes and extracts the manually entered suffix", () => {
    expect(composeIdentifier("RUT*", "123-4")).toBe("RUT*123-4");
    expect(composeIdentifier("RUT*", "RUT*123-4")).toBe("RUT*123-4");
    expect(identifierSuffix("RUT*123-4", "RUT*")).toBe("123-4");
  });
  it("uses the format and description supplied by OpenMRS", () => {
    const configured = { ...type, identifierSources: [], format: "^[0-9]{7,8}-[0-9K]$", formatDescription: "RUN inválido" };
    expect(validateConfiguredIdentifier(configured, "12345678-5", false).valid).toBe(true);
    expect(validateConfiguredIdentifier(configured, "ABC", false)).toEqual({ valid: false, message: "RUN inválido" });
  });
});
