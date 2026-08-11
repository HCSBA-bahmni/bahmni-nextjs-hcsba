import { describe, expect, it } from "vitest";
import { toClinicalPatientContext } from "./patientContext";

describe("clinical patient context", () => {
  it("maps the same patient profile contract used by registration", () => {
    const context = toClinicalPatientContext({ patient: { identifiers: [
      { identifier: "RUN*1-9", identifierType: { name: "RUN" } },
      { identifier: "P-123", identifierType: { name: "Passport", display: "Pasaporte" } },
    ], person: { gender: "F", birthdateEstimated: true, birthtime: "1990-01-01T08:15:00.000-0300", names: [{ givenName: "Ana", familyName: "Pérez" }], addresses: [{ address1: "Calle 1", cityVillage: "Santiago" }], attributes: [{ attributeType: { name: "email", display: "Correo" }, value: "ana@example.org" }] } }, relationships: [{ uuid: "r1", personA: { uuid: "p1" }, personB: { uuid: "p2", display: "Juan Pérez" }, relationshipType: { aIsToB: "Hermana", bIsToA: "Hermano" } }] }, "p1");
    expect(context).toMatchObject({ uuid: "p1", name: "Ana Pérez", identifier: "RUN*1-9", gender: "F", address: "Calle 1, Santiago" });
    expect(context.addressFields).toMatchObject({ address1: "Calle 1", cityVillage: "Santiago" });
    expect(context.attributes).toEqual([{ name: "email", label: "Correo", value: "ana@example.org" }]);
    expect(context.additionalIdentifiers).toEqual([{ name: "Passport", label: "Pasaporte", value: "P-123" }]);
    expect(context).toMatchObject({ birthDateEstimated: true, birthTime: "1990-01-01T08:15:00.000-0300", image: "/openmrs/ws/rest/v1/patientImage?patientUuid=p1" });
    expect(context.relationships).toEqual([{ uuid: "r1", type: "Hermana", personUuid: "p2", personDisplay: "Juan Pérez" }]);
  });
});
