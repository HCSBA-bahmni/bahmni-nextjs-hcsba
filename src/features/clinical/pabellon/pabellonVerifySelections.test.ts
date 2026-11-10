import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPabellonCatalogue, type PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
import { emptyPabellonSurgeonDraft } from "./pabellonSurgeonDraft";
import { PabellonSelectionChangedError, verifyPabellonSelections } from "./pabellonVerifySelections";
import type { PabellonSubmissionInput } from "@/services/bahmni/pabellonSubmission";
vi.mock("@/services/bahmni/pabellonCatalogues", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellonCatalogues")>(), getPabellonCatalogue: vi.fn() }));
const option = (group = "procedures", id = "1"): PabellonCatalogueOption => ({ sourceId: id, code: group === "procedures" ? "2004006" : id, display: "QA ORIGINAL " + id, system: "urn:hcsba:pabellon:catalogue:" + group, active: true, relations: [] });
const page = (items = [option()], nextCursor: string | null = null) => ({ catalogue: "procedures" as const, items, nextCursor, version: "a".repeat(64), observedAt: "2026-11-03T17:00:00Z", correlationId: crypto.randomUUID() });
const input = (clinical: PabellonSubmissionInput["clinical"]) => ({ clinical } as PabellonSubmissionInput);
describe("read-only validation of original selections", () => {
  beforeEach(() => vi.resetAllMocks());
  it("checks exact ID, code and label instead of accepting an old QA ID", async () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections.procedures = [option()];
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page());
    await verifyPabellonSelections(draft, emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [1] }), new AbortController().signal);
    expect(getPabellonCatalogue).toHaveBeenCalledWith("procedures", expect.objectContaining({ search: "2004006", limit: 100 }));
    vi.mocked(getPabellonCatalogue).mockResolvedValue(page([{ ...option(), display: "NOMBRE ACTUAL DISTINTO" }]));
    await expect(verifyPabellonSelections(draft, emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [1] }), new AbortController().signal)).rejects.toBeInstanceOf(PabellonSelectionChangedError);
  });
  it("keeps duplicate MAI codes distinct by their native source IDs and paginates", async () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections.procedures = [option(), option("procedures", "2")];
    vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page([option()], "NEXT")).mockResolvedValueOnce(page([option("procedures", "2")]));
    await verifyPabellonSelections(draft, emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [1, 2] }), new AbortController().signal);
    expect(getPabellonCatalogue).toHaveBeenCalledTimes(2);
  });
  it("rejects changed versions across pages", async () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections.procedures = [option("procedures", "2")];
    vi.mocked(getPabellonCatalogue).mockResolvedValueOnce(page([option()], "NEXT")).mockResolvedValueOnce({ ...page([option("procedures", "2")]), version: "b".repeat(64) });
    await expect(verifyPabellonSelections(draft, emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [2] }), new AbortController().signal)).rejects.toThrow();
  });
  it("ignores hidden unused selections and verifies a registered surgeon", async () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections["priority-types"] = [option("priority-types")];
    const surgeon = { mode: "registered" as const, name: "", selected: option("surgeons") };
    vi.mocked(getPabellonCatalogue).mockResolvedValue({ ...page([option("surgeons")]), catalogue: "surgeons" });
    await verifyPabellonSelections(draft, surgeon, input({ cirujano: 1, tipo_prioridad_id: null, grupo_sanguineo_id: 0 }), new AbortController().signal);
    expect(getPabellonCatalogue).toHaveBeenCalledTimes(1); expect(getPabellonCatalogue).toHaveBeenCalledWith("surgeons", expect.objectContaining({ search: "QA ORIGINAL 1" }));
  });
  it("rejects IDs absent from the displayed selections", async () => {
    await expect(verifyPabellonSelections(emptyPabellonClinicalDraft(), emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [99] }), new AbortController().signal)).rejects.toBeInstanceOf(PabellonSelectionChangedError);
    expect(getPabellonCatalogue).not.toHaveBeenCalled();
  });
  it("aborts without any metadata request or clinical write", async () => {
    const draft = emptyPabellonClinicalDraft(); draft.selections.procedures = [option()]; const c = new AbortController(); c.abort();
    await expect(verifyPabellonSelections(draft, emptyPabellonSurgeonDraft(), input({ plan_quirurgico: [1] }), c.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(getPabellonCatalogue).not.toHaveBeenCalled();
  });
});
