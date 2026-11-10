import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardContext } from "../dashboardContext";
import type { ReactNode } from "react";
import { getPabellonCatalogue, type PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { bahmniRequestWithResponse, BahmniApiError } from "@/services/bahmni/http";
import { PabellonRequestLauncher } from "./PabellonRequestLauncher";
import { emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
import { loadPabellonPatientContact } from "./pabellonPatientPrefill";
import { getVisitDetails } from "@/services/bahmni/visits";
vi.mock("@/services/bahmni/visits", () => ({ getVisitDetails: vi.fn() }));
vi.mock("@/services/bahmni/pabellonCatalogues", async (original) => ({ ...await original<typeof import("@/services/bahmni/pabellonCatalogues")>(), getPabellonCatalogue: vi.fn() }));
vi.mock("@/services/bahmni/http", async (original) => ({ ...await original<typeof import("@/services/bahmni/http")>(), bahmniRequestWithResponse: vi.fn() }));
const option = (group: string): PabellonCatalogueOption => ({ sourceId: "1", code: "1", system: "urn:hcsba:pabellon:catalogue:" + group, display: "QA " + group, active: true, relations: [] });
vi.mock("./pabellonPatientPrefill", () => ({ loadPabellonPatientContact: vi.fn() }));
vi.mock("./PabellonSurgeonFields", () => ({ PabellonSurgeonFields: ({ disabled, onChange }: { disabled: boolean; onChange(value: unknown): void }) =>
  <button disabled={disabled} onClick={() => onChange({ mode: "manual", selected: null, name: "QA MEDICO" })}>Completar médico QA</button> }));
vi.mock("./PabellonRequestFields", () => ({ PabellonRequestFields: ({ disabled, onChange, patientFields, surgeonFields }: { disabled: boolean; onChange(value: unknown): void; patientFields: ReactNode; surgeonFields: ReactNode }) =>
  <>{patientFields}{surgeonFields}<button disabled={disabled} onClick={() => {
    const draft = emptyPabellonClinicalDraft();
    for (const group of ["theatres", "specialties", "surgery-types", "care-types", "patient-priorities", "priority-types", "admission-services", "surgical-approaches", "procedures"] as const) draft.selections[group] = [option(group)];
    onChange({ ...draft, diagnosis: "QA DIAGNOSIS", duration: "01:00", hospitalized: false, priorHospitalization: false, oncology: false, latexAllergy: false, reintervention: false, lateral: false, biopsy: false, bloodProducts: false, destinationBed: false });
  }}>Completar clínica QA</button></> }));
function context(): ClinicalDashboardContext {
  const patient = crypto.randomUUID(); const visit = crypto.randomUUID(); const closed = crypto.randomUUID();
  return { patient: { uuid: patient, name: "QA PACIENTE ACTUAL" }, user: { uuid: crypto.randomUUID() }, visits: [
    { uuid: visit, startDatetime: "2026-11-03T10:00:00Z", stopDatetime: null, patient: { uuid: patient }, visitType: { display: "OPD" } },
    { uuid: closed, startDatetime: "2026-11-02T10:00:00Z", stopDatetime: "2026-11-02T11:00:00Z", patient: { uuid: patient }, visitType: { display: "OPD" } },
  ], visit: { uuid: visit, startDatetime: "2026-11-03T10:00:00Z", stopDatetime: null }, locale: "es", timeZone: "America/Santiago" } as unknown as ClinicalDashboardContext;
}
function receipt(sendId: string, status = 201) { return { status, headers: new Headers({ "Cache-Control": "no-store" }), data: { sendId, correlationId: crypto.randomUUID(), result: { surgeryId: "7000000", requestNumber: "261103001", stateAtCreation: 1 } } }; }
function show(ctx = context(), compact = false, autoOpen = false) {
  const onCreated = vi.fn(); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><PabellonRequestLauncher context={ctx} onCreated={onCreated} compact={compact} autoOpen={autoOpen} /></QueryClientProvider>);
  return { ...view, ctx, onCreated, client };
}
async function prepare() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar pabellón" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Solicitar pabellón" }));
  await screen.findByRole("dialog");
  await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
}
async function complete() {
  for (const name of ["Completar médico QA", "Completar clínica QA"]) fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Verificando catálogos" })).not.toBeInTheDocument());
}
describe("HIS complete request dialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getVisitDetails).mockImplementation(async (uuid) => ({ uuid, startDatetime: "2026-11-03T10:00:00Z", stopDatetime: null, voided: false }));
    vi.mocked(loadPabellonPatientContact).mockImplementation(async (patient) => ({ patient, issues: [], draft: { telephone: "900000000", address: "QA", addressNumber: "1", commune: { ...option("communes"), sourceId: "90", code: "13101", system: "urn:hcsba:personas:catalogue:communes" }, insurance: { ...option("insurances"), sourceId: "7", code: "0", system: "urn:hcsba:personas:catalogue:insurances" }, insuranceSegment: "", sex: { ...option("sexes"), sourceId: "6", code: "4", display: "Indeterminado", system: "urn:hcsba:personas:catalogue:sexes" } } }));
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function(this: HTMLElement) { return this.parentElement; });
    vi.mocked(getPabellonCatalogue).mockImplementation(async (group) => ({ catalogue: group, version: "a".repeat(64), items: group === "approach-types" ? [] : [option(group)], nextCursor: null, observedAt: "2026-11-03T10:00:00Z", correlationId: crypto.randomUUID() }));
  });
  afterEach(() => vi.restoreAllMocks());
  it("can open the new-request form directly without submitting anything", async () => {
    show(context(), false, true);
    await screen.findByRole("dialog");
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("shows only the direct request action in the valid sidebar context", async () => {
    show(context(), true); await prepare();
    expect(screen.queryByRole("button", { name: "Vincular solicitud existente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recuperar envío por referencia" })).not.toBeInTheDocument();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("does not offer sidebar registration for a closed visit", async () => {
    const ctx = context(); ctx.visit = { ...ctx.visit!, stopDatetime: "2026-11-03T11:00:00Z" };
    show(ctx, true);
    await waitFor(() => expect(getPabellonCatalogue).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Solicitar pabellón" })).not.toBeInTheDocument();
  });
  it("reviews without posting, then single-flights the send and refreshes history once", async () => {
    const { onCreated } = show(); await prepare(); await complete();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
    let done!: (value: ReturnType<typeof receipt>) => void;
    vi.mocked(bahmniRequestWithResponse).mockImplementation(() => new Promise((resolve) => { done = resolve; }));
    const send = screen.getByRole("button", { name: "Enviar solicitud a Pabellón" }); fireEvent.click(send); fireEvent.click(send);
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Procesando solicitud" })).toBeDisabled();
    const body = JSON.parse(vi.mocked(bahmniRequestWithResponse).mock.calls[0]![1]!.body as string);
    expect(body).not.toHaveProperty("patientUuid"); expect(body).not.toHaveProperty("actorUuid");
    expect(body.patientDetails).not.toHaveProperty("name"); expect(body.clinical.nombre_cirujano).toBe("QA MEDICO");
    await act(async () => done(receipt(body.sendId)));
    expect(await screen.findByText("Solicitud registrada: 261103001")).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
  it("finishes loading on network error, survives minimize and recovers only the same reference", async () => {
    const { onCreated } = show(); await prepare(); await complete();
    vi.mocked(bahmniRequestWithResponse).mockRejectedValueOnce(new Error("PRIVATE ERROR"));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" }));
    await screen.findByRole("button", { name: "Verificar mismo envío" });
    const reference = (screen.getByLabelText("Referencia técnica del envío") as HTMLInputElement).value;
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE ERROR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minimizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Verificar envío pendiente" }));
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(receipt(reference, 200));
    fireEvent.click(await screen.findByRole("button", { name: "Verificar mismo envío" }));
    await screen.findByText("Solicitud registrada: 261103001");
    const [path, options] = vi.mocked(bahmniRequestWithResponse).mock.calls[1]!;
    expect(path).toMatch(/requests\/recover$/);
    expect(Object.keys(JSON.parse(options!.body as string)).sort()).toEqual(["sendId", "visitUuid", "encounterUuid"].sort());
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(2); expect(onCreated).toHaveBeenCalledTimes(1);
  });
  it("allows editing after an exact validation failure, retaining the same send ID", async () => {
    show(); await prepare(); await complete();
    vi.mocked(bahmniRequestWithResponse).mockImplementationOnce(async (_path, options) => {
      const body = JSON.parse(options!.body as string);
      throw new BahmniApiError(422, "PRIVATE", { code: "CREATION_INPUT_INVALID", message: "PRIVATE", correlationId: crypto.randomUUID(), retryable: false, sendId: body.sendId, recoveryRequired: false });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
    const first = JSON.parse(vi.mocked(bahmniRequestWithResponse).mock.calls[0]![1]!.body as string);
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(receipt(first.sendId));
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" }));
    await screen.findByText("Solicitud registrada: 261103001");
    expect(JSON.parse(vi.mocked(bahmniRequestWithResponse).mock.calls[1]![1]!.body as string).sendId).toBe(first.sendId);
  });
  it("recovers from the original closed visit without enabling a new create", async () => {
    const ctx = context(); ctx.visit = ctx.visits[1]; show(ctx);
    await waitFor(() => expect(screen.getByRole("button", { name: "Recuperar envío por referencia" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Solicitar pabellón" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar envío por referencia" }));
    const sendId = crypto.randomUUID();
    fireEvent.change(await screen.findByLabelText("Referencia del envío *"), { target: { value: sendId } });
    fireEvent.click(screen.getByRole("button", { name: "Seleccione" }));
    fireEvent.click(await screen.findByRole("option", { name: /Cerrada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preparar recuperación" }));
    vi.mocked(bahmniRequestWithResponse).mockResolvedValueOnce(receipt(sendId, 200));
    fireEvent.click(screen.getByRole("button", { name: "Verificar mismo envío" }));
    await screen.findByText("Solicitud registrada: 261103001");
    const [path, options] = vi.mocked(bahmniRequestWithResponse).mock.calls[0]!;
    expect(path).toMatch(/requests\/recover$/);
    expect(JSON.parse(options!.body as string)).toMatchObject({ sendId, visitUuid: ctx.visits[1]!.uuid });
  });
  it("blocks stale catalogue selections, ends loading and preserves the draft", async () => {
    const normal = vi.mocked(getPabellonCatalogue).getMockImplementation()!;
    vi.mocked(getPabellonCatalogue).mockImplementation(async (group, query) => {
      const page = await normal(group, query);
      return group === "specialties" ? { ...page, items: [{ ...option(group), display: "CHANGED ORIGINAL LABEL" }] } : page;
    });
    show(); await prepare(); await complete();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Cambió un catálogo/);
    expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled();
    expect(screen.getByLabelText("Teléfono de contacto *")).toHaveValue("900000000");
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("ends catalogue loading after a failure and allows a read-only retry", async () => {
    const normal = vi.mocked(getPabellonCatalogue).getMockImplementation()!;
    show(); await prepare();
    vi.mocked(getPabellonCatalogue).mockImplementation(async (group, query) => {
      if (group === "specialties") throw new Error("PRIVATE CATALOGUE FAILURE");
      return normal(group, query);
    });
    await complete();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
    expect(screen.queryByText(/PRIVATE CATALOGUE FAILURE/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono de contacto *")).toHaveValue("900000000");
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    vi.mocked(getPabellonCatalogue).mockImplementation(normal);
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    expect(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" })).toBeEnabled();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("does not post an incomplete form", async () => {
    show(); await prepare();
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Seleccione|Ingrese|Falta/);
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("blocks a visit closed after opening the dashboard before creating a send", async () => {
    vi.mocked(getVisitDetails).mockImplementation(async (uuid) => ({ uuid, startDatetime: "2026-11-03T10:00:00Z", stopDatetime: "2026-11-03T23:59:00Z", voided: false }));
    show(); await prepare(); await complete();
    expect(await screen.findByRole("alert")).toHaveTextContent(/atención ya no está activa/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("ends the preflight loader after native visit failure without posting", async () => {
    vi.mocked(getVisitDetails).mockRejectedValue(new Error("PRIVATE VISIT FAILURE"));
    show(); await prepare(); await complete();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
    expect(screen.queryByText(/PRIVATE VISIT FAILURE/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("formats the original visit in the HIS locale and timezone, not raw ISO", async () => {
    const ctx = context(); show(ctx); await prepare();
    const start = ctx.visits[0]!.startDatetime;
    const {formatPabellonVisit}=await import("./pabellonDates");
    const expected = formatPabellonVisit(start,ctx.timeZone);
    expect(screen.getByText("OPD · " + expected + " · Activa")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(start))).not.toBeInTheDocument();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("lets missing registry data be completed in the request without a registry write", async () => {
    const normal = vi.mocked(loadPabellonPatientContact).getMockImplementation()!;
    vi.mocked(loadPabellonPatientContact).mockImplementation(async (p, s) => { const result = await normal(p, s); return { ...result, draft: { ...result.draft, telephone: "" }, issues: ["Falta teléfono en Registro."] }; });
    show(); await prepare(); await complete();
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Teléfono de contacto *"), { target: { value: "911111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    expect(screen.getByLabelText("Teléfono de contacto *")).toBeDisabled();
    vi.mocked(bahmniRequestWithResponse).mockImplementation(async (_path, options) => receipt(JSON.parse(options!.body as string).sendId));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" }));
    await screen.findByText("Solicitud registrada: 261103001");
    expect(bahmniRequestWithResponse).toHaveBeenCalledTimes(1);
    const [path, options] = vi.mocked(bahmniRequestWithResponse).mock.calls[0]!;
    expect(path).toMatch(/requests$/); expect(JSON.parse(options!.body as string).patientDetails.telephone).toBe("911111111");
  });
  it("preserves local corrections through refresh/minimize and updates untouched values", async () => {
    const { ctx } = show(); await prepare();
    fireEvent.change(screen.getByLabelText("Teléfono de contacto *"), { target: { value: "911111111" } });
    const original = await vi.mocked(loadPabellonPatientContact).getMockImplementation()!(ctx.patient);
    vi.mocked(loadPabellonPatientContact).mockResolvedValue({ ...original, draft: { ...original.draft, telephone: "922222222", address: "QA REFRESHED" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar datos del Registro" }));
    await waitFor(() => expect(screen.getByLabelText("Dirección *")).toHaveValue("QA REFRESHED"));
    expect(screen.getByLabelText("Teléfono de contacto *")).toHaveValue("911111111");
    fireEvent.click(screen.getByRole("button", { name: "Minimizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar borrador" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud" })).toBeEnabled());
    expect(screen.getByLabelText("Teléfono de contacto *")).toHaveValue("911111111");
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("ends the profile loader after failure, blocks review and supports a successful retry", async () => {
    const normal = vi.mocked(loadPabellonPatientContact).getMockImplementation()!;
    vi.mocked(loadPabellonPatientContact).mockRejectedValueOnce(new Error("PRIVATE failure")).mockImplementation(normal);
    show(); await prepare();
    expect(screen.getByLabelText("Teléfono de contacto *")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    expect(screen.queryByRole("button", { name: "Enviar solicitud a Pabellón" })).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar datos del Registro" }));
    await waitFor(() => expect(screen.getByLabelText("Teléfono de contacto *")).toBeEnabled());
    await complete(); expect(screen.getByRole("button", { name: "Enviar solicitud a Pabellón" })).toBeEnabled();
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("selects communes from the original catalogue, not arbitrary free text", async () => {
    show(); await prepare();
    const p = screen.getByLabelText(/^Comuna/).closest(".p-dropdown")!;
    fireEvent.click(p);
    await screen.findByRole("listbox");
    await waitFor(() => expect(getPabellonCatalogue).toHaveBeenCalledWith("communes", expect.objectContaining({ search: "" })));
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("never carries request-local corrections into another patient's draft", async () => {
    const { rerender, client, onCreated } = show(); await prepare();
    fireEvent.change(screen.getByLabelText("Teléfono de contacto *"), { target: { value: "911111111" } });
    rerender(<QueryClientProvider client={client}><PabellonRequestLauncher context={context()} onCreated={onCreated} /></QueryClientProvider>);
    await prepare(); expect(screen.getByLabelText("Teléfono de contacto *")).toHaveValue("900000000");
    expect(bahmniRequestWithResponse).not.toHaveBeenCalled();
  });
  it("never publishes an old patient's late result in a newly selected context", async () => {
    const { rerender, client, onCreated } = show(); await prepare(); await complete();
    let done!: (value: ReturnType<typeof receipt>) => void;
    vi.mocked(bahmniRequestWithResponse).mockImplementation(() => new Promise((resolve) => { done = resolve; }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar solicitud a Pabellón" }));
    const body = JSON.parse(vi.mocked(bahmniRequestWithResponse).mock.calls[0]![1]!.body as string);
    const other = context(); other.patient.name = "OTHER QA CONTEXT";
    rerender(<QueryClientProvider client={client}><PabellonRequestLauncher context={other} onCreated={onCreated} /></QueryClientProvider>);
    await act(async () => done(receipt(body.sendId)));
    expect(screen.queryByText("Solicitud registrada: 261103001")).not.toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
