import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardContext } from "@/features/clinical/dashboardContext";
import { IpdPabellonSection, ipdPabellonContextAllowed } from "./IpdPabellonSection";
const shared = vi.fn();
vi.mock("@/features/clinical/ClinicalDashboardSection", () => ({ ClinicalDashboardSectionCard: (props: unknown) => { shared(props); return <div>SHARED SNAPSHOT CONTROL</div>; } }));
const context = () => ({ patient: { uuid: "patient-qa" }, user: { uuid: "actor-qa" }, visit: { uuid: "visit-qa" }, visits: [{ uuid: "visit-qa" }] }) as ClinicalDashboardContext;
afterEach(() => { cleanup(); shared.mockClear(); });
describe("IPD reuses patient snapshot history without inventing attention links", () => {
  it("reuses the existing control and declares patient-level, not visit-level evidence", () => {
    const ctx=context(); render(<IpdPabellonSection context={ctx} visitUuid="visit-qa" source="qa-isolated" />);
    expect(screen.getByText("SHARED SNAPSHOT CONTROL")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("no acreditan un vínculo con esta atención");
    expect(shared.mock.calls[0]?.[0]).toMatchObject({ context: ctx, section: { type: "pabellonHospitalario", config: {source:"qa-isolated"} } });
  });
  for (const reason of ["missing-visit", "other-visit", "not-in-patient-visits", "duplicate-visit", "no-actor", "no-patient", "source-disabled"]) {
    it(`does not mount or query surgical control: ${reason}`, () => {
      const ctx=context(); let source: unknown="qa-isolated";
      if(reason==="missing-visit") ctx.visit=undefined;
      if(reason==="other-visit") ctx.visit={uuid:"different"} as ClinicalDashboardContext["visit"];
      if(reason==="not-in-patient-visits") ctx.visits=[];
      if(reason==="duplicate-visit") ctx.visits=[...ctx.visits,...ctx.visits];
      if(reason==="no-actor") ctx.user=null;
      if(reason==="no-patient") ctx.patient.uuid="";
      if(reason==="source-disabled") source="production";
      expect(ipdPabellonContextAllowed(ctx,"visit-qa",source)).toBe(false);
      render(<IpdPabellonSection context={ctx} visitUuid="visit-qa" source={source} />);
      expect(screen.getByRole("alert")).toHaveTextContent("No se consulta Pabellón"); expect(shared).not.toHaveBeenCalled();
    });
  }
  it("unmounts the previous context on visit change", () => {
    const ctx=context(); const view=render(<IpdPabellonSection context={ctx} visitUuid="visit-qa" source="qa-isolated" />);
    view.rerender(<IpdPabellonSection context={ctx} visitUuid="other-visit" source="qa-isolated" />);
    expect(screen.queryByText("SHARED SNAPSHOT CONTROL")).not.toBeInTheDocument();
  });
});
