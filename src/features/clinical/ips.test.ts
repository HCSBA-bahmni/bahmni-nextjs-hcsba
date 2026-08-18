import { afterEach, describe, expect, it, vi } from "vitest";
import { generateIcvp, generateVhl, icvpArtifacts, resolveIpsAttachment, resolveVhl, searchIpsDocuments } from "./ips";

afterEach(() => vi.unstubAllGlobals());

describe("IPS same-origin contracts", () => {
  it("uses ITI-67 with the legacy identifier normalization and stable sorting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      resourceType: "Bundle", type: "searchset", link: [], entry: [
        { resource: { resourceType: "DocumentReference", id: "old", date: "2026-01-01T00:00:00Z", type: { text: "IPS antiguo" }, content: [] } },
        { resource: { resourceType: "DocumentReference", id: "new", date: "2026-08-03T00:00:00Z", type: { text: "IPS reciente" }, content: [] } },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const documents = await searchIpsDocuments("/openmrs/ips-mediator/regional", "RUN*SYN-IPS-001");

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin);
    expect(url.pathname).toBe("/openmrs/ips-mediator/regional/DocumentReference");
    expect(url.searchParams.get("patient.identifier")).toBe("SYN-IPS-001");
    expect(url.searchParams.get("_count")).toBe("50");
    expect(documents.map((document) => document.id)).toEqual(["new", "old"]);
  });

  it("rewrites a legacy regional attachment through the same-origin mediator and rejects unrelated origins", () => {
    expect(resolveIpsAttachment("/openmrs/ips-mediator/regional", "https://legacy.local:5000/regional/Bundle/18")).toBe("/openmrs/ips-mediator/regional/Bundle/18");
    expect(() => resolveIpsAttachment("/openmrs/ips-mediator/regional", "https://untrusted.local/Bundle/18")).toThrow("origen no permitido");
  });

  it("preserves VHL issue/resolve and ICVP payloads without authorization headers", async () => {
    const bundle = { resourceType: "Bundle" as const, id: "bundle-1", entry: [], link: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ hc1: "HC1:ISSUED" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ location: "/openmrs/ips-mediator/regional/Bundle/18", contentType: "application/fhir+json" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ immunizationId: "imm-1", ok: true }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateVhl("/openmrs/ips-mediator/vhl/_generate", bundle)).resolves.toBe("HC1:ISSUED");
    await expect(resolveVhl("/openmrs/ips-mediator/vhl/_resolve", "HC1:INPUT")).resolves.toHaveLength(1);
    await expect(generateIcvp("/openmrs/ips-mediator/icvpcert/_from-bundle", bundle)).resolves.toEqual([expect.objectContaining({ immunizationId: "imm-1" })]);
    expect(fetchMock.mock.calls.every(([, init]) => !new Headers(init?.headers).has("Authorization"))).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ qrCodeContent: "HC1:INPUT" });
  });

  it("extracts PNG and HC1 artifacts from the ICVP DocumentReference", () => {
    const result = { immunizationId: "imm-1", data: { entry: [{ resource: { resourceType: "DocumentReference", content: [
      { attachment: { contentType: "image/png", data: "cG5n" }, format: { code: "image" } },
      { attachment: { contentType: "text/plain", data: btoa("HC1:VALUE") }, format: { code: "hc1" } },
    ] } }] } };
    expect(icvpArtifacts(result)).toEqual({ pngDataUrl: "data:image/png;base64,cG5n", hc1: "HC1:VALUE" });
  });
});
