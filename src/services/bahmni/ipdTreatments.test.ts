import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrnScheduledOrderUuids, saveMedicationSchedule } from "./ipdTreatments";

afterEach(() => vi.unstubAllGlobals());

describe("IPD treatment scheduling contracts", () => {
  it("posts the legacy schedule payload to the create and edit endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "schedule" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "schedule" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = { patientUuid: "patient", providerUuid: "provider", orderUuid: "order", comments: "", serviceType: "MEDICATION_REQUEST" as const, slotStartTime: 1_780_000_000, medicationFrequency: "START_TIME_DURATION_FREQUENCY" as const };
    await saveMedicationSchedule(payload, "create");
    await saveMedicationSchedule(payload, "edit");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/ipd/schedule/type/medication");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/ipd/schedule/type/medication/edit");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(payload);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("maps PRN placeholder slots back to their order UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ uuid: "slot", order: { uuid: "order-2" } }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPrnScheduledOrderUuids("patient", ["order-1", "order-2"])).resolves.toEqual(new Set(["order-2"]));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.searchParams.get("serviceType")).toBe("AS_NEEDED_PLACEHOLDER");
    expect(url.searchParams.getAll("orderUuids")).toEqual(["order-1", "order-2"]);
  });
});
