import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardControlProps } from "../dashboardContext";
import { getPabellonHistory, PabellonReadError, validatePabellonPage, type PabellonPage } from "@/services/bahmni/pabellon";
import { PabellonHistoryControl } from "./PabellonHistoryControl";

vi.mock("@/services/bahmni/pabellon", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellon")>(), getPabellonHistory: vi.fn() }));
const patient = "11111111-1111-4111-8111-111111111111";
const page = () => validatePabellonPage({ schemaVersion: "2", patient: { uuid: patient, hisEnvironment: "bahmni225-dev", identityStatus: "matched", linkVersion: 1 }, observedAt: "2026-10-28T10:00:00Z", correlationId: "22222222-2222-4222-8222-222222222222", nextCursor: null, items: [{ id: "1", source: { system: "pabellon-hcsba-qa", environment: "qa-isolated", endpointEnvironment: "qa-isolated227", id: "1", observedAt: "2026-10-28T10:00:00Z", revision: "fixture-revision" }, requestSnapshot: { status: "available", snapshotId: "1", version: 1, capturedAt: null }, warningCodes: [], request: { contentSource: "request-snapshot", requestNumber: "261027001", origin: "normal", urgencyRequestComplete: null, patientAtRegistration: { givenNames: "SNAPSHOT ONLY", familyName: "FROZEN", secondFamilyName: null }, specialty: null, plannedProcedures: null, diagnosis: "FIXTURE DIAGNOSIS", duration: null, hospitalization: { value: false, provenance: "legacy-default" }, admissionService: null, stateAtSnapshot: null, schedulesAtSnapshot: null } }] }, patient);
const props = () => ({ context: { patient: { uuid: patient, givenName: "LIVE PERSON MUST NOT APPEAR" }, user: { uuid: "33333333-3333-4333-8333-333333333333" } }, section: { config: { source: "qa-isolated" } }, expanded: false, reportState: vi.fn() }) as unknown as DashboardControlProps;
function show(p = props()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PabellonHistoryControl {...p} /></QueryClientProvider>);
}
describe("Pabellón history control", () => {
  beforeEach(() => vi.resetAllMocks());
  it("uses frozen names in details and never the native/current name", async () => {
    vi.mocked(getPabellonHistory).mockResolvedValue(page()); show();
    await screen.findByText("261027001"); fireEvent.click(screen.getByRole("button", { name: "Ver solicitud" }));
    expect(await screen.findByText("SNAPSHOT ONLY FROZEN")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Información clínica" })).toHaveClass("clinical-card");
    expect(screen.getByRole("region", { name: "Seguimiento operativo" })).toHaveClass("clinical-card");
    expect(screen.queryByText("LIVE PERSON MUST NOT APPEAR")).not.toBeInTheDocument();
    expect(screen.getByText(/No se interpreta como estado actual/)).toBeInTheDocument();
  });
  it("stops the loader after failure and de-duplicates retry while pending", async () => {
    vi.mocked(getPabellonHistory).mockRejectedValueOnce(new PabellonReadError("AUDIT_UNAVAILABLE")); show();
    await screen.findByRole("alert"); const retry = screen.getByRole("button", { name: "Reintentar" });
    expect(retry).toBeEnabled();
    let resolve!: (page: PabellonPage) => void;
    vi.mocked(getPabellonHistory).mockImplementation(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(getPabellonHistory).toHaveBeenCalledTimes(2));
    resolve(page()); await screen.findByText("261027001");
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeEnabled();
  });
  it("never fetches unless QA activation is explicit", () => {
    const p = props(); p.section.config = {}; show(p);
    expect(screen.getByText(/Integración no configurada/)).toBeInTheDocument();
    expect(getPabellonHistory).not.toHaveBeenCalled();
  });
});
