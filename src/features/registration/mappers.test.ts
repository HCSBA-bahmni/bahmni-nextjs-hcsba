import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { estimatedBirthDate, toPatientProfilePayload } from "./mappers";

describe("patientprofile mapper", () => {
  it("uses the Bahmni patient/person envelope", () => {
    const result = toPatientProfilePayload({ givenName: "Ana", familyName: "Pérez", familyName2: "Soto", gender: "F", birthDate: "1990-01-02", identifier: "123", identifierTypeUuid: "type", locationUuid: "loc", phoneNumber: "555", attributes: { "social-uuid": "Anita", "phone-uuid": "555" }, relationships: [] });
    expect(result.patient.identifiers).toEqual([{ identifier: "123", identifierType: "type", preferred: true, voided: false }]);
    expect(result.patient.person).toMatchObject({ gender: "F", birthdate: "1990-01-02", birthdateEstimated: false });
    expect(result.patient.person.names).toEqual([expect.objectContaining({ familyName: "Pérez", familyName2: "Soto", display: "Ana Pérez Soto" })]);
    expect(result.patient.person.attributes).toEqual(expect.arrayContaining([expect.objectContaining({ attributeType: { uuid: "social-uuid" }, value: "Anita" }), expect.objectContaining({ attributeType: { uuid: "phone-uuid" }, value: "555" })]));
  });
  it("calculates an estimated date from years, months and days", () => expect(estimatedBirthDate(30, 1, 6, DateTime.fromISO("2026-08-03"))).toBe("1996-06-28"));
  it("preserves the explicit estimated-date flag", () => {
    const result = toPatientProfilePayload({ givenName: "Ana", familyName: "Pérez", gender: "F", birthDate: "1996-06-27", birthDateEstimated: true, ageYears: 30, ageMonths: 1, ageDays: 6, attributes: {}, relationships: [] });
    expect(result.patient.person.birthdateEstimated).toBe(true);
  });
  it("preserves the selected OpenMRS identifier source for server-side generation", () => {
    const result = toPatientProfilePayload({ givenName: "Ana", familyName: "Pérez", gender: "F", birthDate: "1990-01-02", identifierTypeUuid: "type", identifierSourceUuid: "source", identifierPrefix: "RUT*", attributes: {}, relationships: [] });
    expect(result.patient.identifiers).toEqual([{ identifier: undefined, identifierSourceUuid: "source", identifierPrefix: "RUT*", identifierType: "type", preferred: true, voided: false }]);
  });
  it("preserves additional identifiers independently of the preferred identifier", () => {
    const result = toPatientProfilePayload({ givenName: "Ana", familyName: "Pérez", gender: "F", identifier: "RUN*1-9", identifierTypeUuid: "run", attributes: {}, relationships: [], additionalIdentifiers: [{ uuid: "passport-id", identifier: "31113", identifierTypeUuid: "passport" }] });
    expect(result.patient.identifiers).toEqual([
      expect.objectContaining({ identifier: "RUN*1-9", identifierType: "run", preferred: true }),
      expect.objectContaining({ uuid: "passport-id", identifier: "31113", identifierType: "passport", preferred: false, voided: false }),
    ]);
  });
});

describe("relationship mapper", () => {
  it("uses OpenMRS relationship references", () => {
    const result = toPatientProfilePayload({ givenName: "Ana", familyName: "Pérez", gender: "F", birthDate: "1990-01-02", attributes: {}, relationships: [{ relationshipTypeUuid: "type", personUuid: "person" }] });
    expect(result.relationships).toEqual([{ relationshipType: { uuid: "type" }, personB: { uuid: "person" }, voided: false }]);
  });
});
