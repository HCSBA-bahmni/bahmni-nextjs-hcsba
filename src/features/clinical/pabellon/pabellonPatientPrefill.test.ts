import { describe, expect, it, vi, beforeEach } from "vitest";
import { prefillPabellonPatientContact, loadPabellonPatientContact } from "./pabellonPatientPrefill";
import { toClinicalPatientContext, type ClinicalPatientContext } from "../patientContext";
import { getPatientProfile } from "@/services/bahmni/patients";
import { searchAddressEntries } from "@/services/bahmni/address";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
vi.mock("@/services/bahmni/patients", () => ({ getPatientProfile: vi.fn() }));
vi.mock("@/services/bahmni/address", () => ({ searchAddressEntries: vi.fn() }));
vi.mock("./pabellonSmallCatalogue", () => ({ loadPabellonSmallCatalogue: vi.fn() }));
const item = (group: string, code: string, display: string) => ({ sourceId: "7", code, display, system: "urn:hcsba:personas:catalogue:" + group, active: true as const, relations: [] });
const communes = [item("communes", "13101", "Santiago")];
const insurances = [item("insurances", "1", "FONASA")];
const hierarchy = [{ name: "Santiago", userGeneratedId: "COM-13101" }];
const patient = (): ClinicalPatientContext => ({ uuid: crypto.randomUUID(), name: "QA", identifier: "QA", gender: "U", address: "", image: "", relationships: [], addressFields: { address1: "CALLE QA", address2: "LOCALIDAD, NO ES NUMERO", cityVillage: "Santiago" }, attributes: [
  { name: "phoneNumber", label: "Teléfono", value: "900000000" },
  { name: "addressNumber", label: "Número", value: "S/N" },
  { name: "fonasaSegment", label: "Tramo", value: "A" },
  { name: "basicHealthInsurance", label: "Previsión", value: "FONASA", valueUuid: "e8200001-0000-4000-8000-000000000001" },
] });
describe("Native HIS patient prefill, never a second registration", () => {
  beforeEach(() => vi.resetAllMocks());
  it("fills only existing fields and uses territorial/original source codes", () => {
    const result = prefillPabellonPatientContact(patient(), communes, insurances, hierarchy);
    expect(result.issues).toHaveLength(1); expect(result.issues[0]).toContain("sexo biológico");
    expect(result.draft).toMatchObject({ telephone: "900000000", addressNumber: "S/N", insuranceSegment: "A", commune: { code: "13101" }, insurance: { code: "1" } });
  });
  it("does not split a street or use Localidad as a house number", () => {

    const p = patient(); p.attributes = p.attributes.filter((a) => a.name !== "addressNumber"); p.addressFields!.address1 = "CALLE 123 DEPTO 4";
    expect(prefillPabellonPatientContact(p, communes, insurances, hierarchy).draft.addressNumber).toBe("");
  });
  it.each(["same-name-wrong-code", "ambiguous", "no-hierarchy"])("does not assign a commune from %s", (mode) => {
    const entries = mode === "no-hierarchy" ? [] : mode === "ambiguous" ? [...hierarchy, { name: "Santiago", userGeneratedId: "COM-99999" }] : [{ name: "Santiago", userGeneratedId: "COM-99999" }];
    expect(prefillPabellonPatientContact(patient(), communes, insurances, entries).draft.commune).toBeNull();
  });
  it("never defaults insurance or matches free text as a coded registration answer", () => {
    const p = patient(); p.attributes.find((a) => a.name === "basicHealthInsurance")!.valueUuid = undefined;
    expect(prefillPabellonPatientContact(p, communes, insurances, hierarchy).draft.insurance).toBeNull();
    const dup = [...insurances, { ...insurances[0]!, sourceId: "8" }];
    expect(prefillPabellonPatientContact(patient(), communes, dup, hierarchy).draft.insurance).toBeNull();
  });
  it("does not default a FONASA segment and rejects ambiguous telephone attributes", () => {
    const p = patient(); p.attributes = p.attributes.filter((a) => a.name !== "fonasaSegment"); p.attributes.push({ name: "phoneNumber", label: "Otro", value: "911111111" });
    const result = prefillPabellonPatientContact(p, communes, insurances, hierarchy);
    expect(result.draft.insuranceSegment).toBe(""); expect(result.draft.telephone).toBe("");
  });
  it("retains coded attribute identities, discards voided attributes and hides literal NULL surname", () => {
    const id = crypto.randomUUID();
    const p = toClinicalPatientContext({ patient: { uuid: id, person: { uuid: id, names: [{ givenName: "QA", familyName: "TEST", familyName2: "NULL" }], attributes: [
      { attributeType: { name: "phoneNumber" }, value: "PRIVATE VOIDED", voided: true },
      { attributeType: { name: "basicHealthInsurance" }, value: { uuid: "e8200001-0000-4000-8000-000000000001", display: "FONASA" } },
    ] } } }, id);
    expect(p.attributes).toHaveLength(1); expect(p.attributes[0]?.valueUuid).toBe("e8200001-0000-4000-8000-000000000001"); expect(p.secondFamilyName).toBe("");
  });
  it("loads a fresh profile rather than using stale dashboard values and passes abort signals", async () => {
    const old = patient(); const signal = new AbortController().signal;
    vi.mocked(getPatientProfile).mockResolvedValue({ patient: { uuid: old.uuid, person: { uuid: old.uuid, names: [], addresses: [{ address1: "NUEVA DIRECCION", cityVillage: "Santiago" }], attributes: [] } } });
    vi.mocked(searchAddressEntries).mockResolvedValue(hierarchy);
    vi.mocked(loadPabellonSmallCatalogue).mockImplementation(async (group) => group === "communes" ? communes : insurances);
    const result = await loadPabellonPatientContact(old, signal);
    expect(result.draft.address).toBe("NUEVA DIRECCION");
    expect(getPatientProfile).toHaveBeenCalledWith(old.uuid, signal);
    expect(searchAddressEntries).toHaveBeenCalledWith("cityVillage", "Santiago", undefined, signal);
  });
  it("rejects another patient's response before loading source masters", async () => {
    vi.mocked(getPatientProfile).mockResolvedValue({ patient: { uuid: crypto.randomUUID(), person: {} } });
    await expect(loadPabellonPatientContact(patient())).rejects.toMatchObject({ code: "SOURCE_CONTRACT_MISMATCH" });
    expect(loadPabellonSmallCatalogue).not.toHaveBeenCalled();
  });
  it.each([
    ["99dfaa79-d6b4-5a61-9dd8-a9d5a12c977c", "1", "Hombre"],
    ["ed3601f5-0cd6-51c1-ad4d-0f34226ade65", "2", "Mujer"],
  ])("prefills only reviewed biological concept %s, never administrative gender", (uuid, code, display) => {
    const p = patient(); p.gender = code === "1" ? "F" : "M";
    p.attributes.push({ name: "biologicalSex", label: "Sexo biológico", value: display, valueUuid: uuid });
    const original = item("sexes", code, display);
    const result = prefillPabellonPatientContact(p, communes, insurances, hierarchy, [original]);
    expect(result.draft.sex).toEqual(original); expect(result.issues).toEqual([]);
    expect(p.gender).toBe(code === "1" ? "F" : "M");
  });
  it.each(["38ef0bea-b343-54b2-8037-7950e0386300", "bae00879-c449-59f4-8b12-59528a4a493b", "2d961045-3c6f-5200-b56d-f93e77af8206", ""]) (
    "leaves an unreviewed/absent concept %s selectable rather than guessing Indeterminado", (uuid) => {
      const p = patient(); p.gender = "M";
      p.attributes.push({ name: "biologicalSex", label: "Sexo biológico", value: "Hombre", valueUuid: uuid });
      expect(prefillPabellonPatientContact(p, communes, insurances, hierarchy, [item("sexes", "4", "Indeterminado"), item("sexes", "1", "Hombre")]).draft.sex).toBeNull();
    });
  it("does not map from labels, wrong native codes or duplicate biological attributes", () => {
    const p = patient(); p.attributes.push({ name: "biologicalSex", label: "Sexo biológico", value: "Hombre", valueUuid: "99dfaa79-d6b4-5a61-9dd8-a9d5a12c977c" });
    expect(prefillPabellonPatientContact(p, communes, insurances, hierarchy, [item("sexes", "6", "Hombre")]).draft.sex).toBeNull();
    p.attributes.push({ name: "biologicalSex", label: "Otro", value: "Mujer", valueUuid: "ed3601f5-0cd6-51c1-ad4d-0f34226ade65" });
    expect(prefillPabellonPatientContact(p, communes, insurances, hierarchy, [item("sexes", "1", "Hombre")]).draft.sex).toBeNull();
  });
  it("keeps verified profile data if a master fails and leaves that choice empty", async () => {
    const p = patient();
    vi.mocked(getPatientProfile).mockResolvedValue({ patient: { uuid: p.uuid, person: { uuid: p.uuid, names: [], addresses: [{ address1: "QA", cityVillage: "Santiago" }], attributes: [] } } });
    vi.mocked(searchAddressEntries).mockResolvedValue(hierarchy);
    vi.mocked(loadPabellonSmallCatalogue).mockImplementation(async (group) => { if (group === "insurances") throw new Error("PRIVATE upstream"); return communes; });
    const result = await loadPabellonPatientContact(p);
    expect(result.draft.address).toBe("QA"); expect(result.draft.commune?.code).toBe("13101"); expect(result.draft.insurance).toBeNull();
    expect(result.issues.join(" ")).toContain("No se pudo verificar la previsión"); expect(result.issues.join(" ")).not.toContain("PRIVATE");
  });
  it("does not bypass a failed profile or an aborted request", async () => {
    vi.mocked(getPatientProfile).mockRejectedValueOnce(new Error("profile unavailable"));
    await expect(loadPabellonPatientContact(patient())).rejects.toThrow("profile unavailable");
    expect(loadPabellonSmallCatalogue).not.toHaveBeenCalled();
    const p = patient(); const abort = new AbortController();
    vi.mocked(getPatientProfile).mockResolvedValue({ patient: { uuid: p.uuid, person: { uuid: p.uuid } } });
    vi.mocked(loadPabellonSmallCatalogue).mockImplementation(async () => { abort.abort(); return []; });
    await expect(loadPabellonPatientContact(p, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
