import { afterEach, describe, expect, it, vi } from "vitest";
import { addBedTag, assignBed, dischargePatient, endVisitAndCreateEncounter, getWardListRows, normalizeBed, removeBedTag, unassignBed, updateBedStatus } from "./ipd";

afterEach(() => vi.unstubAllGlobals());

describe("IPD service mappers", () => {
  it("normalizes the admissionLocation full representation without dropping extensions", () => {
    const result = normalizeBed({ bedId: 7, bedUuid: "bed", bedNumber: "A-7", status: "AVAILABLE", rowNumber: 2, columnNumber: 3, location: "Room A", vendorField: "kept", bedTagMaps: [{ uuid: "map", bedTag: { uuid: "tag", name: "Isolation" } }], patients: [] });
    expect(result).toMatchObject({ bedId: 7, bedUuid: "bed", rowNumber: 2, columnNumber: 3, vendorField: "kept" });
    expect(result.bedTagMaps[0]?.bedTag.name).toBe("Isolation");
  });

  it("preserves a singular patient from the individual bed representation", () => {
    const result = normalizeBed({ bedId: 7, bedNumber: "A-7", patient: { uuid: "patient", display: "Paciente" } });
    expect(result.patient).toMatchObject({ uuid: "patient", display: "Paciente" });
  });

  it("maps the legacy occupant person name before the composite display", () => {
    const result = normalizeBed({ bedId: 7, bedNumber: "A-7", patients: [{ uuid: "patient", display: "SYN-1 - Nombre Paciente", person: { display: "Nombre Paciente" }, identifiers: [{ identifier: "SYN-1" }] }] });
    expect(result.patient).toMatchObject({ uuid: "patient", name: "Nombre Paciente", display: "Nombre Paciente", identifier: "SYN-1" });
  });

  it("matches the legacy nested numeric contract for assigning and removing bed tags", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "map", bedTag: { id: 4, uuid: "tag", name: "Isolation" } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await addBedTag(7, 4);
    await removeBedTag("map");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bedTagMap/");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ bed: { id: 7 }, bedTag: { id: 4 } });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/bedTagMap/map");
  });

  it("matches the legacy endpoint and payload for changing an administrative bed status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await updateBedStatus("bed/with spaces", "RESERVED");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bed/bed%2Fwith%20spaces");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ status: "RESERVED" }) });
  });

  it("uses the configured SQL list and bahmnicore visit conversion endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ patient: "Ana" }]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encounterUuid: "encounter" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getWardListRows("bedManagement.sqlGet.patientListForAdmissionLocation", "Room A");
    await endVisitAndCreateEncounter("visit", { patientUuid: "patient" });
    const listUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({ q: "bedManagement.sqlGet.patientListForAdmissionLocation", v: "full", location_name: "Room A" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/visit/endVisitAndCreateEncounter?visitUuid=visit");
  });

  it("matches the legacy assignment and discharge write contracts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await assignBed(7, "patient", "encounter");
    await dischargePatient({ patientUuid: "patient", encounterTypeUuid: "discharge" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/beds/7");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ patientUuid: "patient", encounterUuid: "encounter" }) });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/bahmnicore/discharge");
  });

  it("uses the bed-management contract to release an orphaned assignment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await unassignBed(7, "patient/uuid");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/beds/7?patientUuid=patient%2Fuuid");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
