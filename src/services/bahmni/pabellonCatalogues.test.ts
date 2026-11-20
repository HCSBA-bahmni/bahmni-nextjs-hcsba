import { beforeEach, describe, expect, it, vi } from "vitest";
import { bahmniRequest, BahmniApiError } from "./http";
import { getPabellonCatalogue, mergePabellonCataloguePages, validatePabellonCataloguePage, type PabellonCatalogueName } from "./pabellonCatalogues";

vi.mock("./http", async (original) => ({ ...await original<typeof import("./http")>(), bahmniRequest: vi.fn() }));
const fixture = () => ({
  catalogue: "procedures", version: "a".repeat(64), items: [
    { sourceId: "1", system: "urn:hcsba:pabellon:catalogue:procedures", code: "QA-PLAN", display: "QA PRESTACION", active: true, relations: [] as unknown[] },
  ], nextCursor: null as string | null, observedAt: "2026-11-02T12:00:00Z", correlationId: "11111111-1111-4111-8111-111111111111",
});

describe("Pabellon paginated catalogues", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(["communes", "insurances"] as const)("preserves native Personas domain and distinct row ID/code for %s", (group) => {
    const value = fixture(); value.catalogue = group;
    value.items[0]!.system = "urn:hcsba:personas:catalogue:" + group;
    value.items[0]!.sourceId = "7"; value.items[0]!.code = group === "communes" ? "13101" : "0";
    expect(validatePabellonCataloguePage(value, group).items[0]).toMatchObject({ sourceId: "7", code: value.items[0]!.code });
    value.items[0]!.system = "urn:hcsba:pabellon:catalogue:" + group;
    expect(() => validatePabellonCataloguePage(value, group)).toThrow();
  });
  it("keeps native ID and MAI code distinct and allows genuine empty catalogues", () => {
    expect(validatePabellonCataloguePage(fixture(), "procedures").items[0]).toMatchObject({ sourceId: "1", code: "QA-PLAN" });
    const value = fixture(); value.items = [];
    expect(validatePabellonCataloguePage(value, "procedures").items).toEqual([]);
  });
  it.each(["group", "version", "domain", "duplicate", "too-many", "empty-next", "inactive", "unknown-field", "relation", "control", "invalid-id"])("rejects mismatched %s", (mode) => {
    const value = fixture();
    if (mode === "group") value.catalogue = "asa";
    if (mode === "version") value.version = "UNVERSIONED";
    if (mode === "domain") value.items[0]!.system = "urn:unreviewed";
    if (mode === "duplicate") value.items.push(structuredClone(value.items[0]!));
    if (mode === "too-many") value.items = Array.from({ length: 101 }, (_, i) => ({ ...value.items[0]!, sourceId: String(i + 1) }));
    if (mode === "empty-next") { value.items = []; value.nextCursor = "CURSOR"; }
    if (mode === "inactive") value.items[0]!.active = false;
    if (mode === "unknown-field") Object.assign(value, { patient: "NOT_ALLOWED" });
    if (mode === "relation") value.items[0]!.relations = [{ sourceId: "7", code: "7", system: "urn:unreviewed", display: null }];
    if (mode === "control") value.items[0]!.display = "QA\nPRIVATE";
    if (mode === "invalid-id") value.items[0]!.sourceId = "NOT-A-NUMBER";
    expect(() => validatePabellonCataloguePage(value, "procedures")).toThrow();
  });
  it("retains the original approach parent without inventing its description", () => {
    const value = fixture(); value.catalogue = "approach-types";
    value.items[0]!.system = "urn:hcsba:pabellon:catalogue:approach-types";
    value.items[0]!.relations = [{ sourceId: "7", code: "7", system: "urn:hcsba:pabellon:catalogue:surgical-approaches", display: null }];
    expect(validatePabellonCataloguePage(value, "approach-types").items[0]!.relations[0]!.display).toBeNull();
  });
  it("preserves page order and refuses mixed versions or duplicate IDs", () => {
    const first = fixture(); first.nextCursor = "OPAQUE";
    const second = fixture(); second.items[0]!.sourceId = "2";
    const pages = [validatePabellonCataloguePage(first, "procedures", 1), validatePabellonCataloguePage(second, "procedures", 1)];
    expect(mergePabellonCataloguePages(pages).map((item) => item.sourceId)).toEqual(["1", "2"]);
    pages[1]!.version = "b".repeat(64);
    expect(() => mergePabellonCataloguePages(pages)).toThrow();
    pages[1]!.version = pages[0]!.version; pages[1]!.items[0]!.sourceId = "1";
    expect(() => mergePabellonCataloguePages(pages)).toThrow();
  });
  it("uses only the same-origin catalogue path with encoded literal fragments and abort/no-store", async () => {
    vi.mocked(bahmniRequest).mockResolvedValue(fixture());
    const controller = new AbortController();
    await getPabellonCatalogue("procedures", { search: "  QA   2004% ", cursor: "OPAQUE+/=", limit: 10, signal: controller.signal });
    const [path, options] = vi.mocked(bahmniRequest).mock.calls[0]!;
    expect(path).toBe("/pabellon-gateway/v1/catalogues/procedures?limit=10&search=QA+2004%25&cursor=OPAQUE%2B%2F%3D");
    expect(options).toMatchObject({ signal: controller.signal, cache: "no-store", skipUnauthorizedEvent: true });
  });
  it.each(["group", "limit", "search", "cursor", "control"])("rejects invalid %s before fetching", async (mode) => {
    const group = mode === "group" ? "../persona" as PabellonCatalogueName : "procedures";
    const options = { limit: mode === "limit" ? 101 : 20, search: mode === "search" ? "a".repeat(121) : mode === "control" ? "QA\nX" : "", cursor: mode === "cursor" ? "" : undefined };
    await expect(getPabellonCatalogue(group, options)).rejects.toMatchObject({ code: "INVALID_FILTER" });
    expect(bahmniRequest).not.toHaveBeenCalled();
  });
  it("keeps safe cursor errors and never retries or exposes private errors", async () => {
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(400, "PRIVATE", { code: "INVALID_CURSOR" }));
    await expect(getPabellonCatalogue("procedures")).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(bahmniRequest).toHaveBeenCalledTimes(1);
    vi.mocked(bahmniRequest).mockRejectedValue(new BahmniApiError(500, "PRIVATE", { code: "PRIVATE" }));
    await expect(getPabellonCatalogue("procedures")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
  it("preserves cancellation rather than converting it into a service error", async () => {
    const controller = new AbortController(); controller.abort();
    const aborted = new DOMException("Aborted", "AbortError");
    vi.mocked(bahmniRequest).mockRejectedValue(aborted);
    await expect(getPabellonCatalogue("procedures", { signal: controller.signal })).rejects.toBe(aborted);
  });
});
