import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("completes pagination so a current-visit request on a later page is not hidden", async () => {
    const first = page(); first.nextCursor = "OPAQUE-NEXT";
    const next = page();
    const active = "44444444-4444-4444-8444-444444444444";
    first.items[0] = { ...first.items[0]!, id: "2", source: { ...first.items[0]!.source, id: "2" } };
    next.items[0]!.care = { visitUuid: active, provenance: "verified-link" };
    const p = props(); p.context.visits = [{ uuid: active, startDatetime: "2026-11-09T10:00:00Z" }]; p.context.visit = p.context.visits[0];
    vi.mocked(getPabellonHistory).mockResolvedValueOnce(first).mockResolvedValueOnce(next);
    const { container } = show(p);
    await screen.findByText("Visita actual");
    expect(getPabellonHistory).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getPabellonHistory).mock.calls[1]![1]).toBe("OPAQUE-NEXT");
    expect(container.querySelector("details")).toHaveTextContent("Visita actual");
    expect(screen.queryByText(/Cargando el resto/)).not.toBeInTheDocument();
  });
  it("stops sequential pagination when a later page fails", async () => {
    const first = page(); first.nextCursor = "OPAQUE-NEXT";
    vi.mocked(getPabellonHistory).mockResolvedValueOnce(first).mockRejectedValueOnce(new PabellonReadError("SOURCE_UNAVAILABLE"));
    show();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(getPabellonHistory).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Cargando el resto/)).not.toBeInTheDocument();
  });
  it("renders nonempty visits as collapsible groups, current first, with per-surgery actions", async () => {
    const fixture = page();
    const active = "44444444-4444-4444-8444-444444444444";
    const old = "55555555-5555-4555-8555-555555555555";
    const row = fixture.items[0]!;
    fixture.items = [
      { ...row, id: "3", source: { ...row.source, id: "3" }, care: { visitUuid: old, provenance: "verified-link" } },
      { ...row, id: "2", source: { ...row.source, id: "2" }, care: { visitUuid: active, provenance: "his-origin" } }, row,
    ];
    const p = props();
    p.context.visits = [{ uuid: old, startDatetime: "2026-10-01T10:00:00Z", stopDatetime: "2026-10-02T10:00:00Z", visitType: { uuid: "opd", display: "OPD" } }, { uuid: active, startDatetime: "2026-11-09T10:00:00Z", visitType: { uuid: "ipd", display: "IPD" } }];
    p.context.visit = p.context.visits[1];
    vi.mocked(getPabellonHistory).mockResolvedValue(fixture);
    const { container } = show(p);
    await screen.findByText("Visita actual");
    const groups = container.querySelectorAll("details");
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveAttribute("open");
    expect(groups[1]).not.toHaveAttribute("open");
    expect(groups[2]).toHaveTextContent("Sin visita vinculada");
    expect(within(groups[0] as HTMLElement).getByRole("button", { name: "Ver solicitud" })).toBeEnabled();
    expect(within(groups[0] as HTMLElement).getByRole("button", { name: "Protocolos" })).toBeEnabled();
  });
  it("labels invalidated events as historical without losing the frozen diagnosis", async () => {
    const fixture = page();
    fixture.items[0]!.request!.operationalAtSnapshot = {
      updatedAt: null, revision: "a".repeat(64), urgencyCompletenessKnown: false,
      captureVersion: 1, changeCode: "evento_editado",
      events: [{ sourceId: "7", active: false, type: { sourceId: "13", system: "urn:test:event", code: "13", display: "Evento corregido" }, option: null,
        occurredAt: { rawValue: "2026-10-28 08:15:00", sourceTimezone: null, normalizedInstant: null, interpretation: "unresolved" } }],
    };
    vi.mocked(getPabellonHistory).mockResolvedValue(fixture); show();
    fireEvent.click(await screen.findByRole("button", { name: "Ver solicitud" }));
    expect(await screen.findByText(/Histórico\/inactivo/)).toBeInTheDocument();
    expect(screen.getByText(/Evento corregido/)).toBeInTheDocument();
    expect(screen.getByText("FIXTURE DIAGNOSIS")).toBeInTheDocument();
    expect(screen.queryByText(/No se interpreta como estado actual/)).not.toBeInTheDocument();
  });
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
    expect(screen.getByRole("button", { name: "Solicitar pabellón" })).toBeInTheDocument();
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
