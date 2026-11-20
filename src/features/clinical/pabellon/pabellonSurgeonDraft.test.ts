import { describe, expect, it } from "vitest";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { buildPabellonSurgeonFields, emptyPabellonSurgeonDraft, updatePabellonSurgeonDraft } from "./pabellonSurgeonDraft";
const doctor = (): PabellonCatalogueOption => ({ sourceId: "101", code: "101", system: "urn:hcsba:pabellon:catalogue:surgeons", display: "QA MÉDICO APELLIDO", active: true, relations: [] });
describe("Pabellón indicating physician draft", () => {
  it("requires an explicit physician, not the current user", () => {
    expect(buildPabellonSurgeonFields(emptyPabellonSurgeonDraft()).fields).toBeNull();
    const result = buildPabellonSurgeonFields({ ...emptyPabellonSurgeonDraft(), selected: doctor() });
    expect(result.fields).toEqual({ cirujano: 101 });
    for (const key of ["actorUuid", "userUuid", "rut", "nombre_cirujano"]) expect(result.fields).not.toHaveProperty(key);
  });
  it("supports the original explicit free-name route without inferring an account", () => {
    expect(buildPabellonSurgeonFields({ mode: "manual", selected: null, name: " QA MÉDICO EXTERNO " }).fields).toEqual({ nombre_cirujano: "QA MÉDICO EXTERNO" });
  });
  it("clears stale values when switching modes, without mutating the previous draft", () => {
    const draft = { ...emptyPabellonSurgeonDraft(), selected: doctor() };
    const manual = updatePabellonSurgeonDraft(draft, { mode: "manual" });
    expect(manual).toEqual({ mode: "manual", selected: null, name: "" }); expect(draft.selected).not.toBeNull();
    expect(updatePabellonSurgeonDraft({ ...manual, name: "QA" }, { mode: "registered" })).toEqual(emptyPabellonSurgeonDraft());
  });
  it.each(["", "NULL", "  ", "0", "QA\nNO", "A".repeat(256)])("rejects invalid free text", (name) => {
    expect(buildPabellonSurgeonFields({ mode: "manual", selected: null, name }).fields).toBeNull();
  });
  it.each(["domain", "zero", "large", "inactive", "code", "relation", "mixed"])("rejects invalid %s reference", (mode) => {
    const selected = doctor(); const draft = { ...emptyPabellonSurgeonDraft(), selected };
    if (mode === "domain") selected.system = "urn:hcsba:personas:catalogue:surgeons";
    if (mode === "zero") selected.sourceId = selected.code = "0";
    if (mode === "large") selected.sourceId = selected.code = "9007199254740993";
    if (mode === "inactive") Object.assign(selected, { active: false });
    if (mode === "code") selected.code = "NATIVE-RUN-IS-NOT-A-ROW-ID";
    if (mode === "relation") selected.relations = [{ sourceId: "1", code: "1", system: "unreviewed", display: null }];
    if (mode === "mixed") draft.name = "ANOTHER NAME";
    expect(buildPabellonSurgeonFields(draft).fields).toBeNull();
  });
  it("rejects an ambiguous manual request with a retained registered physician", () => {
    expect(buildPabellonSurgeonFields({ mode: "manual", selected: doctor(), name: "QA" }).fields).toBeNull();
  });
});
