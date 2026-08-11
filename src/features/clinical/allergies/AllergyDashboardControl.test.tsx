import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardContext } from "../dashboardContext";
import { AllergyDashboardControl } from "./AllergyDashboardControl";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("allergy dashboard", () => {
  it("shows legacy summary fields and reveals comments in the expanded detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("implementation_config")) return json({}, 404);
      if (url.endsWith("/clinical/app.json")) return json({ config: { showTextAsAbnormal: false } });
      return json({ entry: [{ resource: {
        id: "allergy-1",
        type: "allergy",
        category: ["food"],
        criticality: "unable-to-assess",
        clinicalStatus: { coding: [{ code: "active" }] },
        recordedDate: "2026-08-04T11:22:00-04:00",
        recorder: { display: "Super Man" },
        note: [{ text: "Comentario clínico visible" }],
        reaction: [{ substance: { coding: [{ display: "Chocolate" }] }, manifestation: [{ coding: [{ display: "Anemia" }] }], severity: "moderate" }],
      } }] });
    }));
    const context = {
      patient: { uuid: "patient", name: "Paciente", identifier: "RUN*1", gender: "F", address: "", attributes: [] },
      visits: [], locale: "es-CL", timeZone: "America/Santiago", privilegeNames: new Set<string>(), tabs: [], user: null, provider: null, location: null,
    } as unknown as ClinicalDashboardContext;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const result = render(<QueryClientProvider client={client}><AllergyDashboardControl section={{} as never} context={context} expanded={false} reportState={() => undefined} /></QueryClientProvider>);

    expect(await screen.findByText("Chocolate")).toBeVisible();
    expect(screen.getByText("Anemia")).toBeVisible();
    expect(screen.getByText("Moderada")).toBeVisible();
    expect(screen.queryByText("Comentario clínico visible")).not.toBeInTheDocument();
    const toggler = result.container.querySelector<HTMLButtonElement>(".p-row-toggler");
    expect(toggler).not.toBeNull();
    fireEvent.click(toggler!);
    expect(await screen.findByText("Comentario clínico visible")).toBeVisible();
    expect(screen.getByText("Super Man")).toBeVisible();
    expect(screen.getByText("active")).toBeVisible();
    expect(screen.getByText("unable-to-assess")).toBeVisible();
  });
});
