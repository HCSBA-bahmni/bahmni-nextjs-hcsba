import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPabellonProtocolPDF, PDF_RENDERER } from "./pabellonProtocolPDF";
vi.mock("./http", () => ({ openmrsBase: "/openmrs" }));
const patient = "11111111-1111-4111-8111-111111111111";
const sourceHash = "a".repeat(64); const body = new TextEncoder().encode("%PDF-1.3\nFIXTURE_ONLY_PDF\n%%EOF");
const pdfHash = createHash("sha256").update(body).digest("hex");
function response(headers: Record<string, string> = {}, bytes = body) { return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "X-Pabellon-PDF-SHA256": pdfHash, "X-Pabellon-Source-SHA256": sourceHash, "X-Pabellon-Renderer": PDF_RENDERER, ...headers } }); }
describe("protected Pabellón PDF", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); vi.stubGlobal("crypto", webcrypto); });
  afterEach(() => vi.unstubAllGlobals());
  it("reads fixed same-origin URL with cancellation and verifies bytes and both hashes", async () => {
    vi.mocked(fetch).mockResolvedValue(response()); const controller = new AbortController();
    const blob = await getPabellonProtocolPDF(patient, "110", "201", sourceHash, controller.signal);
    expect(blob.type).toBe("application/pdf"); expect(blob.size).toBe(body.length);
    expect(fetch).toHaveBeenCalledWith(`/openmrs/pabellon-gateway/v1/patients/${patient}/surgeries/110/protocols/201/pdf`, expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal }));
  });
  it.each(["invalid", "0", "0201", "../201", "9223372036854775808"])("rejects invalid snapshot %s before fetching", async (snapshot) => {
    await expect(getPabellonProtocolPDF(patient, "110", snapshot, sourceHash, new AbortController().signal)).rejects.toMatchObject({ code: "CONTEXT" }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["mime", "pdf-hash", "source-hash", "renderer", "magic", "size"])("rejects mismatched %s without producing a preview", async (kind) => {
    const headers: Record<string, string> = {}; let bytes: Uint8Array<ArrayBuffer> = body;
    if (kind === "mime") headers["Content-Type"] = "text/html";
    if (kind === "pdf-hash") headers["X-Pabellon-PDF-SHA256"] = "b".repeat(64);
    if (kind === "source-hash") headers["X-Pabellon-Source-SHA256"] = "b".repeat(64);
    if (kind === "renderer") headers["X-Pabellon-Renderer"] = "unapproved";
    if (kind === "magic") bytes = new TextEncoder().encode("<html>PRIVATE_RESPONSE</html>");
    if (kind === "size") bytes = new Uint8Array(512 * 1024 + 1);
    vi.mocked(fetch).mockResolvedValue(response(headers, bytes));
    await expect(getPabellonProtocolPDF(patient, "110", "201", sourceHash, new AbortController().signal)).rejects.toMatchObject({ code: "CONTRACT" });
  });
  it.each([401, 403, 404, 409, 503, 504])("maps HTTP %s without reading private error body", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("PRIVATE_SQL_MESSAGE", { status }));
    const error = await getPabellonProtocolPDF(patient, "110", "201", sourceHash, new AbortController().signal).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).not.toContain("PRIVATE_");
  });
  it("preserves abort errors without issuing a second request", async () => {
    const controller = new AbortController(); controller.abort(); vi.mocked(fetch).mockRejectedValue(controller.signal.reason);
    await expect(getPabellonProtocolPDF(patient, "110", "201", sourceHash, controller.signal)).rejects.toBe(controller.signal.reason); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
