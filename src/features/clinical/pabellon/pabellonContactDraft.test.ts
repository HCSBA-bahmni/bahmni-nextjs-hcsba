import { describe, expect, it } from "vitest";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { buildPabellonPatientDetails, emptyPabellonContactDraft, updatePabellonContactDraft } from "./pabellonContactDraft";
const option = (group: string, sourceId: string, code: string, display: string): PabellonCatalogueOption => ({ sourceId, code, display, system: "urn:hcsba:personas:catalogue:" + group, active: true, relations: [] });
const valid = () => ({ ...emptyPabellonContactDraft(), telephone: "900000000", address: "CALLE QA", addressNumber: "S/N",
  commune: option("communes", "90", "13101", "QA COMUNA"), insurance: option("insurances", "7", "0", "DESCONOCIDO"), sex: option("sexes", "6", "4", "Indeterminado") });
describe("HIS contact and coverage draft", () => {
  it("uses native commune/insurance CODES, not row IDs, retaining insurance zero", () => {
    const result = buildPabellonPatientDetails(valid());
    expect(result.errors).toEqual([]);
    expect(result.details).toMatchObject({ communeId: 13101, insuranceCode: 0, insuranceSegment: "" });
    expect(result.details).not.toHaveProperty("personasId"); expect(result.details).not.toHaveProperty("rut");
  });
  it("never assumes unknown coverage or a commune for an empty form", () => {
    expect(buildPabellonPatientDetails(emptyPabellonContactDraft()).details).toBeNull();
  });
  it("requires an explicit valid sex selection and uses original code, not row ID", () => {
    expect(buildPabellonPatientDetails({ ...valid(), sex: null }).details).toBeNull();
    expect(buildPabellonPatientDetails(valid()).details).toMatchObject({ sexCode: 4, sexName: "Indeterminado" });
    expect(buildPabellonPatientDetails({ ...valid(), sex: { ...valid().sex, system: "urn:hcsba:pabellon:catalogue:sexes" } }).details).toBeNull();
  });
  it("requires FONASA segment by institutional code, not by name", () => {
    const draft = valid(); draft.insurance = option("insurances", "8", "1", "FONASA");
    expect(buildPabellonPatientDetails(draft).details).toBeNull();
    expect(buildPabellonPatientDetails({ ...draft, insuranceSegment: "B" }).details?.insuranceSegment).toBe("B");
    expect(buildPabellonPatientDetails({ ...draft, insuranceSegment: "X" as "A" }).details).toBeNull();
  });
  it("clears FONASA segment after changing/removing the insurer without mutating prior draft", () => {
    const draft = { ...valid(), insurance: option("insurances", "8", "1", "FONASA"), insuranceSegment: "B" as const };
    const next = updatePabellonContactDraft(draft, { insurance: valid().insurance });
    expect(next.insuranceSegment).toBe(""); expect(draft.insuranceSegment).toBe("B");
    expect(updatePabellonContactDraft(draft, { insurance: null }).insuranceSegment).toBe("");
  });
  it.each(["domain", "code", "zero-commune", "large", "inactive", "null-label", "foreign-relation"])("rejects %s instead of inventing a mapping", (mode) => {
    const draft = valid();
    if (mode === "domain") draft.commune.system = "urn:hcsba:pabellon:catalogue:communes";
    if (mode === "code") draft.insurance.code = "07";
    if (mode === "zero-commune") draft.commune.code = "0";
    if (mode === "large") draft.commune.code = "9007199254740993";
    if (mode === "inactive") Object.assign(draft.commune, { active: false });
    if (mode === "null-label") draft.commune.display = "NULL";
    if (mode === "foreign-relation") draft.commune.relations = [{ sourceId: "1", system: "foreign", code: "1", display: null }];
    expect(buildPabellonPatientDetails(draft).details).toBeNull();
  });
  it.each(["", "NULL", "900\nNO", "9".repeat(21)])("rejects invalid phone", (telephone) => {
    expect(buildPabellonPatientDetails({ ...valid(), telephone }).details).toBeNull();
  });
  it("trims new contact data without ever filling identity fields", () => {
    const details = buildPabellonPatientDetails({ ...valid(), telephone: " 900000000 ", address: " CALLE QA " }).details!;
    expect(details.telephone).toBe("900000000"); expect(details.address).toBe("CALLE QA");
    expect(Object.keys(details).sort()).toEqual(["telephone", "address", "addressNumber", "communeId", "communeName", "insuranceCode", "insuranceName", "insuranceSegment", "sexCode", "sexName"].sort());
  });
});
