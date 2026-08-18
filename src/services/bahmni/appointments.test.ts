import { afterEach, describe, expect, it, vi } from "vitest";
import { changeAppointmentStatus, changeProviderResponse, deleteAppointmentService, findAppointmentConflicts, findRecurringConflicts, getAppointment, getAppointmentService, getAppointmentsForDate, loadAppointmentServicesFull, saveAppointmentService, saveRecurringAppointments, searchAppointmentPatients, searchAppointments, searchAppointmentsByFilters } from "./appointments";
import type { AppointmentPayload } from "@/features/appointments/types";

afterEach(() => vi.unstubAllGlobals());

const payload: AppointmentPayload = {
  patientUuid: "patient", serviceUuid: "service", startDateTime: "2026-08-14T13:00:00.000Z", endDateTime: "2026-08-14T13:30:00.000Z",
  providers: [{ uuid: "provider", response: "ACCEPTED" }], status: "Scheduled", appointmentKind: "Scheduled", teleconsultation: false,
};

describe("appointment REST contracts", () => {
  it("reuses the proven registration patient search contract for new appointments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pageOfResults: [{ uuid: "patient", identifier: "ID-1", givenName: "Ana", familyName: "Pérez" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchAppointmentPatients("Ana", "location")).resolves.toEqual([expect.objectContaining({ uuid: "patient", identifier: "ID-1" })]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/bahmni/search/patient/lucene");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Ana", identifier: "Ana", s: "byIdOrName", startIndex: "0", limit: "20", loginLocationUuid: "location", filterOnAllIdentifiers: "true" });
  });

  it("uses the ranged search contract with singular filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ appointments: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchAppointments({ startDate: "start", endDate: "end", providerUuid: "provider", status: "Scheduled" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/appointments/search");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ startDate: "start", endDate: "end", providerUuid: "provider", status: "Scheduled" });
  });

  it("accepts the deployed search response when the embedded service has an empty location", async () => {
    const response = [{
      uuid: "appointment", patient: { uuid: "patient", name: "Paciente" },
      service: { uuid: "service", name: "Consulta", location: {}, speciality: { uuid: "speciality", name: "Especialidad" } },
      provider: null, providers: [{ uuid: "provider", name: "Proveedor", response: "ACCEPTED" }],
      location: { uuid: "location", name: "Box" }, startDateTime: 1786723200000, endDateTime: 1786724100000,
      appointmentKind: "Virtual", status: "Scheduled", teleconsultation: null, additionalInfo: null, extensions: {}, recurring: false,
    }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchAppointments({ startDate: "start", endDate: "end" })).resolves.toEqual([
      expect.objectContaining({ uuid: "appointment", service: expect.objectContaining({ location: null, serviceTypes: [], weeklyAvailability: [] }) }),
    ]);
  });

  it("uses the legacy filter search contract for arrays and wait list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchAppointmentsByFilters({ patientUuids: ["patient"], providerUuids: ["provider"], status: "WaitList" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/appointment/search");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ patientUuids: ["patient"], providerUuids: ["provider"], status: "WaitList" });
  });

  it("uses the original query contracts for day and UUID reads", async () => {
    const appointment = { uuid: "a", patient: { uuid: "p" }, service: { uuid: "s" }, providers: [], startDateTime: "2026-08-14T13:00:00Z", endDateTime: "2026-08-14T13:30:00Z", status: "Scheduled" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(appointment), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getAppointmentsForDate("2026-08-14T04:00:00.000Z");
    await getAppointment("a b");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/appointment/all?forDate=");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/appointment/?uuid=a+b");
  });

  it("checks conflicts before writes using the original payload", async () => {
    const conflicting = { uuid: "a", patient: { uuid: "p" }, service: { uuid: "s" }, providers: [], startDateTime: "2026-08-14T13:00:00Z", endDateTime: "2026-08-14T13:30:00Z", status: "Scheduled" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ PATIENT: [conflicting] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const conflicts = await findAppointmentConflicts(payload);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/appointments/conflicts");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(payload);
    expect(conflicts).toEqual([expect.objectContaining({ uuid: "a", message: "PATIENT" })]);
  });

  it("accepts unsaved service-unavailable conflicts with a null UUID", async () => {
    const conflicting = {
      uuid: null,
      patient: { uuid: "p", name: "Paciente" },
      service: { uuid: "s", name: "awa", startTime: "14:00:00", endTime: "18:00:00" },
      providers: [],
      startDateTime: 1786723200000,
      endDateTime: 1786728600000,
      status: "Requested",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ SERVICE_UNAVAILABLE: [conflicting] }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(findAppointmentConflicts(payload)).resolves.toEqual([
      expect.objectContaining({ uuid: undefined, message: "SERVICE_UNAVAILABLE", appointment: expect.objectContaining({ uuid: null }) }),
    ]);
  });

  it("wraps recurring writes in appointmentRequest and recurringPattern", async () => {
    const recurringResponse = [{ appointmentDefaultResponse: { uuid: "a", patient: { uuid: "p" }, service: { uuid: "s" }, providers: [], startDateTime: "2026-08-14T13:00:00Z", endDateTime: "2026-08-14T13:30:00Z", status: "Scheduled" }, recurringPattern: { type: "WEEK", period: 1, frequency: 2, daysOfWeek: ["FRIDAY"] } }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(recurringResponse), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await saveRecurringAppointments(payload, { repeatOn: ["FRIDAY"], numberOfOccurrences: 2 });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.appointmentRequest).toEqual(payload);
    expect(body.recurringPattern).toEqual({ type: "WEEK", period: 1, frequency: 2, daysOfWeek: ["FRIDAY"] });
  });

  it("treats 204 conflict responses as no conflicts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(findRecurringConflicts(payload, { repeatOn: ["FRIDAY"], numberOfOccurrences: 2 })).resolves.toEqual([]);
  });

  it("selects the recurring status endpoint and sends timezone", async () => {
    const response = { uuid: "a", patient: { uuid: "p" }, service: { uuid: "s" }, providers: [], startDateTime: "2026-08-14T13:00:00Z", endDateTime: "2026-08-14T13:30:00Z", status: "Cancelled" };
    const recurringResponse = [{ appointmentDefaultResponse: response, recurringPattern: { type: "WEEK", period: 1, frequency: 2, daysOfWeek: ["FRIDAY"] } }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(recurringResponse), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await changeAppointmentStatus("a", "Cancelled", true, "America/Santiago");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/recurring-appointments/a/changeStatus");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(expect.objectContaining({ toStatus: "Cancelled", applyForAll: true, timeZone: "America/Santiago" }));
  });

  it("sends the provider UUID in providerResponse and accepts an empty success body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await changeProviderResponse("appointment", "provider", "ACCEPTED");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ uuid: "provider", response: "ACCEPTED" });
  });

  it("uses the original appointment service administration read contracts", async () => {
    const service = { uuid: "service", name: "Cardiología", location: {}, serviceTypes: [], weeklyAvailability: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([service]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(service), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadAppointmentServicesFull()).resolves.toEqual([expect.objectContaining({ uuid: "service", location: null })]);
    await getAppointmentService("service one");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/appointmentService/all/full");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/appointmentService?uuid=service+one");
  });

  it("uses POST for create/edit and DELETE with the service UUID", async () => {
    const service = { uuid: "service", name: "Cardiología", serviceTypes: [], weeklyAvailability: [] };
    const servicePayload = { uuid: "service", name: "Cardiología", serviceTypes: [], weeklyAvailability: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(service), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveAppointmentService(servicePayload);
    await deleteAppointmentService("service");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(servicePayload);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/openmrs/ws/rest/v1/appointmentService?uuid=service");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });
});
