import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("diagnosis dashboard control", () => {
  it("keeps provider details behind a compact inline chevron", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      existingObs: "diagnosis-1",
      codedAnswer: { name: "Anemia" },
      certainty: "PRESUMED",
      order: "PRIMARY",
      diagnosisDateTime: "2026-08-05T07:50:00-04:00",
      providers: [{ name: "Dra. Rivera" }],
    }]), { status: 200, headers: { "content-type": "application/json" } })));

    const section = {
      id: "diagnosis",
      type: "diagnosis",
      sourceIndex: 0,
      displayType: "Half-Page",
      dashboardConfig: {},
      expandedViewConfig: {},
      config: {},
      formGroup: [],
      raw: { showDetailsButton: true, showCertainty: true, showOrder: true },
    } as ClinicalDashboardSection;
    const context = {
      patient: { uuid: "patient", name: "Paciente", identifier: "RUN*1", gender: "F", address: "", attributes: [] },
      visits: [],
      locale: "es-CL",
      timeZone: "America/Santiago",
      privilegeNames: new Set<string>(),
      tabs: [],
      user: null,
      provider: null,
      location: null,
    } as unknown as ClinicalDashboardContext;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Diagnosis = getDashboardControlAdapter("diagnosis").Component;

    render(<QueryClientProvider client={client}><Diagnosis section={section} context={context} expanded={false} reportState={() => undefined} /></QueryClientProvider>);

    expect(await screen.findByText("Anemia")).toBeVisible();
    expect(screen.queryByText("Ver detalles")).not.toBeInTheDocument();
    const detailsToggle = screen.getByLabelText("Ver detalles de Anemia");
    expect(screen.getByText("Registrado por Dra. Rivera")).not.toBeVisible();
    fireEvent.click(detailsToggle);
    expect(screen.getByText("Registrado por Dra. Rivera")).toBeVisible();
  });
});
