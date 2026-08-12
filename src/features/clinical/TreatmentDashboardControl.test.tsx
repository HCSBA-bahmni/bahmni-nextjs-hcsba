import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import type { ClinicalDashboardContext } from "./dashboardContext";
import { getDashboardControlAdapter } from "./DashboardControlRegistry";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("treatment dashboard control", () => {
  it("renders the legacy visit hierarchy without exposing epoch dates or full-width detail bars", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      visitDrugOrders: [{
        uuid: "drug-1",
        visit: { uuid: "visit-1", startDateTime: "1774955218000" },
        drug: { display: "Paracetamol 500 mg", dosageForm: { display: "Comprimido" } },
        dosingInstructions: { dose: 1, doseUnits: "Comprimido", route: "Oral", frequency: "Twice a day" },
        duration: 20,
        durationUnits: "Days",
        effectiveStartDate: "2026-08-04T20:00:00-04:00",
        provider: { name: "Dra. Rivera" },
      }],
      otherActiveDrugOrders: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const section = {
      id: "treatments",
      type: "treatment",
      sourceIndex: 0,
      displayType: "Half-Page",
      dashboardConfig: { showFlowSheet: true, showListView: true, showRoute: true, showDrugForm: true, showDetailsButton: true, numberOfVisits: 5 },
      expandedViewConfig: {},
      config: {},
      formGroup: [],
      raw: {},
    } as ClinicalDashboardSection;
    const context = {
      patient: { uuid: "patient", name: "Paciente", identifier: "RUN*1", gender: "F", address: "", attributes: [] },
      visits: [],
      visit: { uuid: "visit-1", startDatetime: "2026-08-04T00:00:00-04:00" },
      visitSummary: { admissionDetails: { uuid: "admission-1" }, startDateTime: "2026-08-04T00:00:00-04:00" },
      locale: "es-CL",
      timeZone: "America/Santiago",
      privilegeNames: new Set<string>(),
      tabs: [],
      user: null,
      provider: null,
      location: null,
    } as unknown as ClinicalDashboardContext;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Treatment = getDashboardControlAdapter("treatment").Component;

    const result = render(<QueryClientProvider client={client}><Treatment section={section} context={context} expanded={false} reportState={() => undefined} /></QueryClientProvider>);
    await screen.findAllByText(/^Visita del /);
    const treatmentList = result.container.querySelector<HTMLElement>(".dashboard-treatment-sections");
    expect(treatmentList).not.toBeNull();
    const dashboard = within(treatmentList!);

    const visitHeading = await dashboard.findByText(/^Visita del /);
    expect(visitHeading).not.toHaveTextContent("1774955218000");
    expect(dashboard.getByText(/^Paracetamol 500 mg/)).toBeVisible();
    expect(dashboard.getByText(/1 Comprimido/)).toHaveTextContent("Oral");
    const share = dashboard.getByRole("button", { name: /Compartir receta/ });
    expect(share).toBeVisible();
    expect(dashboard.queryByRole("button", { name: "Descargar receta" })).not.toBeInTheDocument();
    expect(share).toHaveAttribute("aria-haspopup", "menu");
    const detailToggle = dashboard.getByLabelText("Ver detalles de Paracetamol 500 mg");
    expect(detailToggle.closest("details")).toHaveClass("dashboard-treatment-details");
    expect(dashboard.getByText("Dra. Rivera")).not.toBeVisible();
    fireEvent.click(detailToggle);
    expect(dashboard.getByText("Dra. Rivera")).toBeVisible();
    const flowSummary = screen.getByText("Cuadro de tratamientos");
    const flow = flowSummary.closest("details");
    expect(flow).not.toHaveAttribute("open");
    expect(within(flow!).getByRole("table")).not.toBeVisible();
    fireEvent.click(flowSummary);
    expect(within(flow!).getByRole("table")).toBeVisible();
  });
});
