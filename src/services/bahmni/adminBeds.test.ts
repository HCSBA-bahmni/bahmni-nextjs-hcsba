import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminBedLayout, normalizeAdminBed, normalizeAdminLocation, saveAdminBed, saveAdminBedLayout } from "./adminBeds";

afterEach(() => vi.unstubAllGlobals());

describe("servicio Beds de OpenMRS", () => {
  it("normaliza ubicación y cama sin perder coordenadas", () => {
    expect(normalizeAdminLocation({ uuid: "ward", name: "Sala", parentLocation: { uuid: "root" } })).toEqual({ uuid: "ward", name: "Sala", description: "", parentUuid: "root" });
    expect(normalizeAdminBed({ rowNumber: 2, columnNumber: 3, bed: { uuid: "bed", bedNumber: "A-1", status: "AVAILABLE", bedType: { name: "Cama" } } })).toMatchObject({ bedUuid: "bed", bedNumber: "A-1", rowNumber: 2, columnNumber: 3, bedType: { name: "Cama" } });
  });

  it("lee la representación layout usada por el OWA", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ward: { uuid: "ward", name: "Sala" }, bedLocationMappings: [{ rowNumber: 1, columnNumber: 2, bed: { uuid: "bed", bedNumber: "A-1" } }] }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(getAdminBedLayout("ward")).resolves.toMatchObject({ rows: 1, columns: 2, beds: [{ bedUuid: "bed", rowNumber: 1, columnNumber: 2 }] });
  });

  it("envía exactamente los payloads de distribución y cama", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    await saveAdminBedLayout("ward", 2, 4);
    await saveAdminBed({ locationUuid: "ward", bedNumber: "A-1", bedType: "Cama", row: 1, column: 2 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ bedLayout: { row: 2, column: 4 } });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ bedNumber: "A-1", bedType: "Cama", row: 1, column: 2, locationUuid: "ward" });
  });
});
