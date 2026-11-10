import { describe, expect, it } from "vitest";
import { mapPersonasPrefill } from "./pabellonPersonasPrefill";
import { validatePersonasPrefill } from "@/services/bahmni/pabellonPersonas";
import type { ClinicalPatientContext } from "../patientContext";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
const patient: ClinicalPatientContext = { uuid: "33333333-3333-4333-8333-333333333333", name: "NOMBRE HIS", givenNames: "NOMBRE", familyName: "HIS", secondFamilyName: "", birthDate: "2000-01-01", gender: "U", identifier: "QA", address: "", image: "", attributes: [], relationships: [] };
const input = () => ({ record: { names: "PRUEBA", firstSurname: "PERSONAS", secondSurname: "", birthDate: "1999-02-03", sexCode: "2", telephone: "900000000", address: "CALLE QA", addressNumber: "1", communeCode: "13101", insuranceCode: "1", insuranceSegment: "A" }, digest: "a".repeat(64) });
const option = (group: string, code: string): PabellonCatalogueOption => ({ sourceId: "77", system: "urn:hcsba:personas:catalogue:" + group, code, display: "QA " + group, active: true, relations: [] });
describe("Personas prefill for a new request", () => {
  it("maps exact source codes, not row IDs; keeps HIS UUID and does not mutate HIS", () => {
    const original = structuredClone(patient); const data = validatePersonasPrefill(input());
    const mapped = mapPersonasPrefill(data, patient, { communes: [option("communes", "13101")], insurances: [option("insurances", "1")], sexes: [option("sexes", "2")] });
    expect(mapped.draft.commune?.code).toBe("13101"); expect(mapped.draft.insuranceSegment).toBe("A"); expect(mapped.patient.uuid).toBe(patient.uuid);
    expect(mapped.patient.name).toBe("PRUEBA PERSONAS"); expect(mapped.patient.birthDate).toBe("1999-02-03"); expect(mapped.differences).toContain("Nombres"); expect(patient).toEqual(original);
  });
  it("leaves unknown and ambiguous masters empty, rather than guessing", () => {
    const mapped = mapPersonasPrefill(input(), patient, { communes: [option("communes", "13101"), option("communes", "13101")], insurances: [], sexes: [] });
    expect(mapped.draft.commune).toBeNull(); expect(mapped.draft.insurance).toBeNull(); expect(mapped.draft.sex).toBeNull(); expect(mapped.draft.insuranceSegment).toBe(""); expect(mapped.issues).toHaveLength(3);
  });
  it.each(["extra", "null", "controls", "invalid-date", "digest"])("rejects invalid contract: %s", mode => {
    const data = input(); const raw: Record<string, unknown> = data;
    if (mode === "extra") raw.personasId = 1;
    if (mode === "null") data.record.secondSurname = "NULL";
    if (mode === "controls") data.record.names = "QA\nPRIVATE";
    if (mode === "invalid-date") data.record.birthDate = "2000-02-30";
    if (mode === "digest") data.digest = "not-digest";
    expect(() => validatePersonasPrefill(raw)).toThrow();
  });
});
