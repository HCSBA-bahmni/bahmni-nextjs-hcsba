import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPabellonProtocolPDF, PabellonPDFError } from "@/services/bahmni/pabellonProtocolPDF";
import type { PabellonProtocolVersion } from "@/services/bahmni/pabellonProtocols";
import { PabellonProtocolPDF } from "./PabellonProtocolPDF";
vi.mock("@/services/bahmni/pabellonProtocolPDF", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellonProtocolPDF")>(), getPabellonProtocolPDF: vi.fn() }));
vi.mock("./PabellonPDFCanvas", () => ({ PabellonPDFCanvas: () => <div title="PDF dibujado localmente" /> }));
const patient = "11111111-1111-4111-8111-111111111111";
const version: PabellonProtocolVersion = { snapshotId: "201", protocolId: "101", version: 1, amendment: false, contentSource: "protocol-snapshot", closedAt: { rawValue: "2026-10-28 08:00:00", sourceTimezone: null, normalizedInstant: null, interpretation: "unresolved" }, capturedAt: null, digitalSignature: "not-established", sourceDataSHA256: "a".repeat(64), clinical: { patientAtRegistration: null, diagnosis: null, surgicalDetail: null, observations: null, surgeon: null, laterality: null, additionalProcedure: null, procedures: [], team: [] } };
const nativeURL = URL;
const show = () => render(<PabellonProtocolPDF patientUuid={patient} surgeryId="110" version={version} />);
describe("protocol PDF preview lifecycle", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("URL", class extends nativeURL { static override createObjectURL = vi.fn(() => "blob:qa-verified"); static override revokeObjectURL = vi.fn(); }); });
  afterEach(() => vi.unstubAllGlobals());
  it("deduplicates clicks and enables download only after verified preview", async () => {
    let finish!: (value: Blob) => void;
    vi.mocked(getPabellonProtocolPDF).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(); const button = screen.getByRole("button", { name: "Vista previa PDF" }); fireEvent.click(button); fireEvent.click(button);
    expect(getPabellonProtocolPDF).toHaveBeenCalledTimes(1); expect(button).toBeDisabled(); expect(screen.getByRole("status")).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
    finish(new Blob(["%PDF-fixture"], { type: "application/pdf" }));
    expect(await screen.findByTitle("PDF dibujado localmente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("download", "protocolo-snapshot-201-v1.pdf");
    expect(screen.getByRole("button", { name: "Volver a consultar PDF" })).toBeEnabled();
  });
  it("clears old preview, revokes its URL and stops loading on failure", async () => {
    vi.mocked(getPabellonProtocolPDF).mockResolvedValueOnce(new Blob(["%PDF-fixture"])); const view = show();
    fireEvent.click(screen.getByRole("button", { name: "Vista previa PDF" })); await screen.findByTitle("PDF dibujado localmente");
    vi.mocked(getPabellonProtocolPDF).mockRejectedValueOnce(new PabellonPDFError("FORBIDDEN"));
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar PDF" }));
    await screen.findByRole("alert"); expect(screen.queryByTitle("PDF dibujado localmente")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-verified"); expect(screen.getByRole("button", { name: "Vista previa PDF" })).toBeEnabled(); view.unmount();
  });
  it("aborts on close and ignores a late success", async () => {
    let finish!: (value: Blob) => void;
    vi.mocked(getPabellonProtocolPDF).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = show(); fireEvent.click(screen.getByRole("button", { name: "Vista previa PDF" }));
    const signal = vi.mocked(getPabellonProtocolPDF).mock.calls[0]![4]; view.unmount(); expect(signal.aborted).toBe(true);
    finish(new Blob(["%PDF-fixture"])); await waitFor(() => expect(URL.createObjectURL).not.toHaveBeenCalled());
  });
  it("revokes the loaded PDF when the selected context is replaced", async () => {
    vi.mocked(getPabellonProtocolPDF).mockResolvedValueOnce(new Blob(["%PDF-fixture"]));
    const view = render(<PabellonProtocolPDF key="context-a" patientUuid={patient} surgeryId="110" version={version} />);
    fireEvent.click(screen.getByRole("button", { name: "Vista previa PDF" })); await screen.findByTitle("PDF dibujado localmente");
    view.rerender(<PabellonProtocolPDF key="context-b" patientUuid={patient} surgeryId="111" version={{ ...version, snapshotId: "202" }} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-verified"); expect(screen.queryByTitle("PDF dibujado localmente")).not.toBeInTheDocument();
  });
});
