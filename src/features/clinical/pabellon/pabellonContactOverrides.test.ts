import { describe, expect, it } from "vitest";
import { emptyPabellonContactDraft, type PabellonContactDraft } from "./pabellonContactDraft";
import { mergePabellonContact, patchPabellonContact } from "./pabellonContactOverrides";
const insurer = (code: string) => ({ sourceId: code, code, display: code === "1" ? "FONASA" : "ISAPRE", system: "urn:hcsba:personas:catalogue:insurances", active: true as const, relations: [] });
const base = (): PabellonContactDraft => ({ ...emptyPabellonContactDraft(), telephone: "900000000", address: "QA ORIGINAL", insurance: insurer("1"), insuranceSegment: "A" });
describe("request-only contact corrections", () => {
  it("retains edited fields across refresh but refreshes untouched fields", () => {
    const original = base(); const overrides = patchPabellonContact(original, {}, { telephone: "911111111" });
    expect(mergePabellonContact({ ...original, telephone: "922222222", address: "QA REFRESHED" }, overrides)).toMatchObject({ telephone: "911111111", address: "QA REFRESHED" });
    expect(original.telephone).toBe("900000000"); expect(Object.keys(overrides)).toEqual(["telephone"]);
  });
  it("keeps intentional blanks/null selections blank after refresh", () => {
    const overrides = patchPabellonContact(base(), {}, { address: "", commune: null });
    expect(mergePabellonContact(base(), overrides)).toMatchObject({ address: "", commune: null });
  });
  it("binds a manually selected FONASA segment to its verified insurer", () => {
    const original = base(); const overrides = patchPabellonContact(original, {}, { insuranceSegment: "D" });
    expect(mergePabellonContact({ ...original, insurance: insurer("2"), insuranceSegment: "" }, overrides)).toMatchObject({ insurance: insurer("1"), insuranceSegment: "D" });
  });
  it("clears the segment when insurance changes or is removed", () => {
    expect(patchPabellonContact(base(), {}, { insurance: insurer("2") }).insuranceSegment).toBe("");
    expect(patchPabellonContact(base(), {}, { insurance: null }).insuranceSegment).toBe("");
    expect(patchPabellonContact(base(), {}, { insurance: insurer("1") }).insuranceSegment).toBe("A");
  });
  it("never retains a segment on a non-FONASA override", () => {
    expect(mergePabellonContact(base(), { insurance: insurer("2"), insuranceSegment: "D" }).insuranceSegment).toBe("");
    expect(patchPabellonContact({ ...base(), insurance: insurer("2") }, {}, { insuranceSegment: "D" }).insuranceSegment).toBe("");
  });
});
