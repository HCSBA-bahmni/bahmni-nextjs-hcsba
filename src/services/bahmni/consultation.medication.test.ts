import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveMedicationOrders, getDrugOrderConfiguration, getPrescribedMedicationOrders } from "./consultation";

afterEach(() => vi.unstubAllGlobals());

describe("legacy consultation medication endpoints", () => {
  it("loads server drug metadata from the same source as treatmentConfig", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ doseUnits: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getDrugOrderConfiguration();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/ws/rest/v1/bahmnicore/config/drugOrders");
  });

  it("preserves active and visit-history query contracts", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    await getActiveMedicationOrders({ patientUuid: "patient", startDate: "2026-01-01" });
    await getPrescribedMedicationOrders({ patientUuid: "patient", numberOfVisits: 3, includeActiveVisit: true });
    const active = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    const history = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");
    expect(active.pathname).toContain("/drugOrders/active");
    expect(active.searchParams.get("patientUuid")).toBe("patient");
    expect(active.searchParams.get("startDate")).toBe("2026-01-01");
    expect(history.pathname).toMatch(/\/drugOrders$/);
    expect(history.searchParams.get("numberOfVisits")).toBe("3");
    expect(history.searchParams.get("includeActiveVisit")).toBe("true");
  });
});
