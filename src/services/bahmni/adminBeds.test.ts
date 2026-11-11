import { afterEach, describe, expect, it, vi } from "vitest";
import { addAdminBedTag, deleteAdminBed, deleteAdminBedTag, deleteAdminBedTagMap, deleteAdminBedType, deleteAdminLocation, getAdminBedLayout, getAdminBedTags, getAdminBedTypes, getAdminLocations, getManagingLocationsEnabled, getVisitLocations, normalizeAdminBed, normalizeAdminLocation, saveAdminBed, saveAdminBedLayout, saveAdminBedTag, saveAdminBedType, saveAdminLocation } from "./adminBeds";

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

  it("consulta y normaliza ubicaciones, ubicaciones de visita, tipos y etiquetas", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const body = url.includes("tag=Admission+Location")
        ? { results: [{ uuid: "ward", name: "Sala", parentLocation: { uuid: "hospital" } }] }
        : url.includes("tag=Visit+Location")
          ? { results: [{ uuid: "hospital", display: "Hospital" }] }
          : url.includes("/bedtype")
            ? { results: [{ uuid: "type", name: "Cama", displayName: "Cama estándar", description: "Adulto" }] }
            : url.includes("/systemsetting")
              ? { results: [{ uuid: "setting", property: "hcsba.bedTag.description.tag", value: "Disponible junto a la cama" }] }
            : { results: [{ id: 4, uuid: "tag", name: "Oxígeno" }] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminLocations()).resolves.toEqual([{ uuid: "ward", name: "Sala", description: "", parentUuid: "hospital" }]);
    await expect(getVisitLocations()).resolves.toEqual([{ uuid: "hospital", name: "Hospital", description: "", parentUuid: undefined }]);
    await expect(getAdminBedTypes()).resolves.toEqual([{ uuid: "type", name: "Cama", displayName: "Cama estándar", description: "Adulto" }]);
    await expect(getAdminBedTags()).resolves.toEqual([{ id: 4, uuid: "tag", name: "Oxígeno", description: "Disponible junto a la cama" }]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/openmrs/ws/rest/v1/location?tag=Admission+Location&v=full",
      "/openmrs/ws/rest/v1/location?tag=Visit+Location&v=full",
      "/openmrs/ws/rest/v1/bedtype?v=full",
      "/openmrs/ws/rest/v1/bedTag?v=full",
      "/openmrs/ws/rest/v1/systemsetting?v=custom%3A%28uuid%2Cproperty%2Cvalue%29&q=hcsba.bedTag.description.",
    ]);
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("normaliza enableManagingLocations=%s", async (value, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ property: "bedmanagement.owa.enableManagingLocations", value }] }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(getManagingLocationsEnabled()).resolves.toBe(expected);
  });

  it("usa false cuando la propiedad no existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(getManagingLocationsEnabled()).resolves.toBe(false);
  });

  it("usa false cuando OpenMRS no permite leer el setting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403, headers: { "content-type": "application/json" } })));
    await expect(getManagingLocationsEnabled()).resolves.toBe(false);
  });

  it("envía exactamente los payloads de distribución y cama", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const body = url.includes("/systemsetting") && (options?.method ?? "GET") === "GET"
        ? { results: [] }
        : url.endsWith("/bedTag") && options?.method === "POST"
          ? { uuid: "new-tag" }
          : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await saveAdminBedLayout("ward", 2, 4);
    await saveAdminBed({ locationUuid: "ward", bedNumber: "A-1", bedType: "Cama", row: 1, column: 2 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ bedLayout: { row: 2, column: 4 } });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ bedNumber: "A-1", bedType: "Cama", row: 1, column: 2, locationUuid: "ward" });
  });

  it("conserva contratos de creación, edición y eliminación de todos los recursos", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const body = url.includes("/systemsetting") && (options?.method ?? "GET") === "GET"
        ? { results: [] }
        : url.endsWith("/bedTag") && options?.method === "POST"
          ? { uuid: "new-tag" }
          : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await saveAdminLocation({ parentLocationUuid: null, name: "Urgencia", description: "Principal" });
    await saveAdminLocation({ uuid: "location", parentLocationUuid: "hospital", name: "Urgencia 2", description: "Editada" });
    await deleteAdminLocation("location");
    await saveAdminBedLayout("ward", 2, 3);
    await saveAdminBed({ locationUuid: "ward", bedNumber: "A-1", bedType: "Cama", row: 1, column: 1 });
    await saveAdminBed({ bedUuid: "bed", locationUuid: "ward", bedNumber: "A-2", bedType: "Cuna", row: 2, column: 1 });
    await deleteAdminBed("bed");
    await saveAdminBedType({ name: "Cama", displayName: "Cama", description: "Adulto" });
    await saveAdminBedType({ uuid: "type", name: "Cuna", displayName: "Cuna", description: "Pediátrica" });
    await deleteAdminBedType("type");
    await saveAdminBedTag({ name: "Aislamiento", description: "Requiere aislamiento." });
    await saveAdminBedTag({ uuid: "tag", name: "Oxígeno", description: "Cuenta con oxígeno." });
    await deleteAdminBedTag("tag");
    await addAdminBedTag(7, 10);
    await deleteAdminBedTagMap("map");

    const requests = fetchMock.mock.calls.map(([url, options]) => ({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(String(options.body)) : undefined }));
    expect(requests).toEqual([
      { url: "/openmrs/ws/rest/v1/admissionLocation", method: "POST", body: { parentLocationUuid: null, name: "Urgencia", description: "Principal" } },
      { url: "/openmrs/ws/rest/v1/admissionLocation/location", method: "POST", body: { parentLocationUuid: "hospital", name: "Urgencia 2", description: "Editada" } },
      { url: "/openmrs/ws/rest/v1/admissionLocation/location", method: "DELETE", body: undefined },
      { url: "/openmrs/ws/rest/v1/admissionLocation/ward?v=layout", method: "POST", body: { bedLayout: { row: 2, column: 3 } } },
      { url: "/openmrs/ws/rest/v1/bed", method: "POST", body: { bedNumber: "A-1", bedType: "Cama", row: 1, column: 1, locationUuid: "ward" } },
      { url: "/openmrs/ws/rest/v1/bed/bed", method: "POST", body: { bedNumber: "A-2", bedType: "Cuna", row: 2, column: 1, locationUuid: "ward" } },
      { url: "/openmrs/ws/rest/v1/bed/bed", method: "DELETE", body: undefined },
      { url: "/openmrs/ws/rest/v1/bedtype", method: "POST", body: { name: "Cama", displayName: "Cama", description: "Adulto" } },
      { url: "/openmrs/ws/rest/v1/bedtype/type", method: "POST", body: { name: "Cuna", displayName: "Cuna", description: "Pediátrica" } },
      { url: "/openmrs/ws/rest/v1/bedtype/type", method: "DELETE", body: undefined },
      { url: "/openmrs/ws/rest/v1/bedTag", method: "POST", body: { name: "Aislamiento" } },
      { url: "/openmrs/ws/rest/v1/systemsetting?v=custom%3A%28uuid%2Cproperty%2Cvalue%29&q=hcsba.bedTag.description.new-tag", method: "GET", body: undefined },
      { url: "/openmrs/ws/rest/v1/systemsetting", method: "POST", body: { property: "hcsba.bedTag.description.new-tag", value: "Requiere aislamiento.", description: "Descripción administrativa de la etiqueta de cama Aislamiento" } },
      { url: "/openmrs/ws/rest/v1/bedTag/tag", method: "POST", body: { name: "Oxígeno" } },
      { url: "/openmrs/ws/rest/v1/systemsetting?v=custom%3A%28uuid%2Cproperty%2Cvalue%29&q=hcsba.bedTag.description.tag", method: "GET", body: undefined },
      { url: "/openmrs/ws/rest/v1/systemsetting", method: "POST", body: { property: "hcsba.bedTag.description.tag", value: "Cuenta con oxígeno.", description: "Descripción administrativa de la etiqueta de cama Oxígeno" } },
      { url: "/openmrs/ws/rest/v1/systemsetting?v=custom%3A%28uuid%2Cproperty%2Cvalue%29&q=hcsba.bedTag.description.tag", method: "GET", body: undefined },
      { url: "/openmrs/ws/rest/v1/bedTag/tag", method: "DELETE", body: undefined },
      { url: "/openmrs/ws/rest/v1/bedTagMap/", method: "POST", body: { bed: { id: 7 }, bedTag: { id: 10 } } },
      { url: "/openmrs/ws/rest/v1/bedTagMap/map", method: "DELETE", body: undefined },
    ]);
  });

  it("traduce el rechazo al eliminar una cama ocupada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "org.openmrs.module.bedmanagement.exception.BedOccupiedException: Bed is occupied" } }), { status: 400, statusText: "Bad Request", headers: { "content-type": "application/json" } })));
    await expect(deleteAdminBed("occupied-bed")).rejects.toThrow("No se puede eliminar una cama ocupada.");
  });
});
