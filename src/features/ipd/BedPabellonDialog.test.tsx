import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BedPabellonDialog } from "./BedPabellonDialog";
import { getPatientVisits } from "@/services/bahmni/visits";
const control = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: { uuid: "actor", privileges: [] }, provider: null, location: null }) }));
vi.mock("@/services/bahmni/auth", () => ({ hasPrivilege: () => true }));
vi.mock("@/services/bahmni/patients", () => ({ getPatientProfile: vi.fn().mockResolvedValue({}) }));
vi.mock("@/features/clinical/patientContext", () => ({ toClinicalPatientContext: (_data: unknown, uuid: string) => ({ uuid }) }));
vi.mock("@/services/bahmni/visits", () => ({ getPatientVisits: vi.fn() }));
vi.mock("@/services/bahmni/config", () => ({ loadAppFile: vi.fn().mockResolvedValue({ theatre: { sections: { history: { type: "pabellonHospitalario", config: { source: "pabellon43-dev" } } } } }) }));
vi.mock("@/features/clinical/pabellon/PabellonHistoryControl", () => ({ PabellonHistoryControl: (props: unknown) => { control(props); return <div>Shared surgical viewers</div>; } }));
afterEach(cleanup);
beforeEach(() => control.mockClear());
function show(visitUuid?: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BedPabellonDialog patientUuid="patient" visitUuid={visitUuid} onHide={() => {}} /></QueryClientProvider>);
}
describe("Pabellón from beds", () => {
  it("reuses the configured control with the explicit patient-scoped visit", async () => {
    vi.mocked(getPatientVisits).mockResolvedValue([{ uuid: "visit" }] as never); show("visit");
    await screen.findByText("Shared surgical viewers");
    expect(control.mock.lastCall?.[0]).toMatchObject({ section: { config: { source: "pabellon43-dev" } }, context: { patient: { uuid: "patient" }, visit: { uuid: "visit" } } });
  });
  it("does not substitute another visit for an unknown explicit visit", async () => {
    vi.mocked(getPatientVisits).mockResolvedValue([{ uuid: "other" }] as never); show("foreign");
    await waitFor(() => expect(control).toHaveBeenCalled());
    expect(control.mock.lastCall?.[0].context.visit).toBeUndefined();
  });
  it("does not choose arbitrarily between multiple active visits", async () => {
    vi.mocked(getPatientVisits).mockResolvedValue([{ uuid: "one" }, { uuid: "two" }] as never); show();
    await waitFor(() => expect(control).toHaveBeenCalled());
    expect(control.mock.lastCall?.[0].context.visit).toBeUndefined();
  });
  it("keeps a closed explicit visit for read-only history", async () => {
    vi.mocked(getPatientVisits).mockResolvedValue([{ uuid: "old", stopDatetime: "2026-11-09T08:00:00Z" }] as never); show("old");
    await waitFor(() => expect(control).toHaveBeenCalled());
    expect(control.mock.lastCall?.[0].context.visit.uuid).toBe("old");
  });
});
