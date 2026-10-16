import { describe, expect, it } from "vitest";
import { profileToForm } from "@/pages/registration/patient/[patientUuid]";

describe("edit patient profile mapping", () => {
  it("preserves the OpenMRS location of every existing identifier", () => {
    const result = profileToForm({
      patient: {
        uuid: "patient-1",
        person: { names: [{ givenName: "Persona", familyName: "Prueba" }], attributes: [] },
        identifiers: [
          { uuid: "primary-id", identifier: "HCSBA100", preferred: true, identifierType: { uuid: "clinical" }, location: { uuid: "original-location" } },
          { uuid: "run-id", identifier: "12345678-5", preferred: false, identifierType: { uuid: "run" }, location: "document-location" },
        ],
      },
      relationships: [],
    }, "patient-1", []);

    expect(result.locationUuid).toBe("original-location");
    expect(result.additionalIdentifiers).toEqual([
      expect.objectContaining({ uuid: "run-id", locationUuid: "document-location" }),
    ]);
  });
});
