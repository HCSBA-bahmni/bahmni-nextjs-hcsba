import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPabellonProtocols, PabellonProtocolError, type PabellonProtocolHistory } from "@/services/bahmni/pabellonProtocols";
import { PabellonProtocolsDialog } from "./PabellonProtocolsDialog";
vi.mock("@/services/bahmni/pabellonProtocols", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellonProtocols")>(), getPabellonProtocols: vi.fn() }));
const patient = "11111111-1111-4111-8111-111111111111";
const fixture = (): PabellonProtocolHistory => ({ schemaVersion: "1", patient: { uuid: patient, hisEnvironment: "bahmni225-dev", identityStatus: "matched", linkVersion: 1 }, surgeryId: "110", source: { system: "pabellon-hcsba-qa", environment: "qa-isolated", endpointEnvironment: "qa-isolated227", id: "110", observedAt: "2026-10-28T12:00:00Z", revision: null }, families: [{ family: "surgeon", status: "available", latestPublishedVersion: 1, withheldVersions: 1, warningCodes: ["AMENDMENT_CLINICAL_REVIEW_REQUIRED"], versions: [{ snapshotId: "201", protocolId: "101", version: 1, amendment: false, contentSource: "protocol-snapshot", closedAt: { rawValue: "2026-10-28 08:00:00", sourceTimezone: null, normalizedInstant: null, interpretation: "unresolved" }, capturedAt: null, digitalSignature: "not-established", sourceDataSHA256: "a".repeat(64), clinical: { patientAtRegistration: { givenNames: "FROZEN NAME", familyName: "FROZEN FAMILY", secondFamilyName: null }, diagnosis: null, surgicalDetail: "FROZEN DETAIL", observations: null, surgeon: null, laterality: null, additionalProcedure: null, procedures: [], team: [] } }] }, { family: "responsible", status: "no-published-versions", latestPublishedVersion: null, withheldVersions: 0, warningCodes: [], versions: [] }], correlationId: "22222222-2222-4222-8222-222222222222" });
function show() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><PabellonProtocolsDialog actorUuid="actor" patientUuid={patient} surgeryId="110" onHide={vi.fn()} /></QueryClientProvider>); }
describe("Pabellón protocol dialog", () => {
  beforeEach(() => vi.resetAllMocks());
  it("lists families and only public versions, then opens frozen detail", async () => {
    vi.mocked(getPabellonProtocols).mockResolvedValue(fixture()); show();
    await screen.findByRole("button", { name: "Ver versión" });
    expect(screen.getByText(/requieren revisión clínica/)).toBeInTheDocument();
    expect(screen.getByText(/Sin versiones publicables/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver versión" }));
    expect(screen.getByText("FROZEN NAME FROZEN FAMILY")).toBeInTheDocument();
    expect(screen.getByText("FROZEN DETAIL")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Datos de la intervención" })).toHaveClass("clinical-card");
    expect(screen.getByRole("region", { name: "Documento de Pabellón" })).toHaveClass("clinical-card");
    expect(screen.getByText(/El cierre no acredita una firma digital/)).toBeInTheDocument();
    expect(screen.queryByText("NULL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al historial de versiones" }));
    expect(screen.queryByText("FROZEN DETAIL")).not.toBeInTheDocument();
  });
  it("finishes loading after error and retry cannot issue duplicate requests", async () => {
    vi.mocked(getPabellonProtocols).mockRejectedValueOnce(new PabellonProtocolError("AUDIT_UNAVAILABLE")); show();
    const retry = await screen.findByRole("button", { name: "Reintentar" }); expect(retry).toBeEnabled();
    let finish!: (value: PabellonProtocolHistory) => void;
    vi.mocked(getPabellonProtocols).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(getPabellonProtocols).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("Cargando protocolos");
    finish(fixture()); await screen.findByRole("button", { name: "Ver versión" });
    expect(screen.getByRole("button", { name: "Actualizar protocolos" })).toBeEnabled();
  });
  it("hides old clinical content if a refresh fails", async () => {
    vi.mocked(getPabellonProtocols).mockResolvedValueOnce(fixture()); show();
    fireEvent.click(await screen.findByRole("button", { name: "Ver versión" })); expect(screen.getByText("FROZEN DETAIL")).toBeInTheDocument();
    vi.mocked(getPabellonProtocols).mockRejectedValueOnce(new PabellonProtocolError("SOURCE_UNAVAILABLE"));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar protocolos" }));
    await screen.findByRole("button", { name: "Reintentar" }); expect(screen.queryByText("FROZEN DETAIL")).not.toBeInTheDocument();
  });
  it("uses cancellation and no retained query on close", async () => {
    vi.mocked(getPabellonProtocols).mockImplementation((_patient, _surgery, signal) => new Promise((_resolve, reject) => { signal?.addEventListener("abort", () => reject(new Error("cancelled"))); }));
    const view = show(); await waitFor(() => expect(getPabellonProtocols).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(getPabellonProtocols).mock.calls[0]![2]; view.unmount(); expect(signal?.aborted).toBe(true);
  });
});
