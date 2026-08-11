import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardContext } from "../dashboardContext";
import { AllergyHeaderAction } from "./AllergyHeaderAction";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("allergy dashboard action", () => {
  it("keeps the search step while typing and advances only after selecting a catalog item", async () => {
    const map = {
      medicationAllergenUuid: "medication",
      foodAllergenUuid: "food",
      environmentalAllergenUuid: "environment",
      allergyReactionUuid: "reaction",
      allergySeverityUuid: "severity",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("implementation_config")) return json({}, 404);
      if (url.endsWith("/clinical/app.json")) return json({ config: { allergyControlConceptIdMap: map } });
      if (url.includes("/concept/medication")) return json({ setMembers: [{ uuid: "penicillin", display: "Penicilina" }], answers: [] });
      if (url.includes("/concept/reaction")) return json({ setMembers: [{ uuid: "rash", display: "Roncha", names: [{ display: "Roncha" }] }], answers: [] });
      if (url.includes("/concept/severity")) return json({ setMembers: [{ uuid: "moderate", display: "Moderado" }], answers: [] });
      return json({ setMembers: [], answers: [] });
    }));
    const context = {
      patient: { uuid: "patient", name: "Paciente", identifier: "RUN*1", gender: "F", address: "", attributes: [] },
      visits: [{ uuid: "active-visit", startDatetime: "2026-08-04T10:00:00.000-04:00" }],
      locale: "es-CL",
      timeZone: "America/Santiago",
      privilegeNames: new Set<string>(),
      tabs: [],
      user: null,
      provider: null,
      location: null,
    } as unknown as ClinicalDashboardContext;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AllergyHeaderAction section={{} as never} context={context} /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    const search = await screen.findByPlaceholderText("Buscar alérgeno");
    await waitFor(() => expect(search).toBeEnabled());
    fireEvent.change(search, { target: { value: "P" } });

    expect(screen.getByRole("heading", { name: "Buscar alérgeno" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Volver a alérgenos" })).not.toBeInTheDocument();
  });
});
