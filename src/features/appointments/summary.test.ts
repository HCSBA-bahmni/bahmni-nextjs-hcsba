import { describe, expect, it } from "vitest";
import { detailedSummaryRows, serviceSummaryRows } from "./summary";
import type { Appointment, AppointmentSummary } from "./types";

describe("appointment summary parity", () => {
  it("maps the server service summary including missed counts and empty services", () => {
    const rows = serviceSummaryRows([{
      appointmentService: { uuid: "service", name: "Cardiología", serviceTypes: [], weeklyAvailability: [] },
      appointmentCountMap: { "2026-08-14": { allAppointmentsCount: 3, missedAppointmentsCount: 1, appointmentServiceUuid: "service" } },
    }, {
      appointmentService: { uuid: "empty", name: "Neurología", serviceTypes: [], weeklyAvailability: [] }, appointmentCountMap: {},
    }] as AppointmentSummary[]);
    expect(rows).toEqual([
      { rowLabel: "Cardiología", rowDataList: [{ date: "2026-08-14", count: 3, missedCount: 1, uuid: "service" }] },
      { rowLabel: "Neurología", rowDataList: [] },
    ]);
  });

  it("builds detailed groups while excluding cancelled appointments", () => {
    const base = {
      patient: { uuid: "patient" }, service: { uuid: "service", name: "Consulta", speciality: { uuid: "speciality", name: "Medicina" }, serviceTypes: [], weeklyAvailability: [] },
      provider: null, providers: [{ uuid: "provider", name: "Dra. Soto", response: "ACCEPTED" }], location: { uuid: "location", name: "Box" },
      startDateTime: 1786723200000, endDateTime: 1786724100000, appointmentKind: "Scheduled", teleconsultation: false, additionalInfo: {}, extensions: {},
    };
    const appointments = [{ ...base, uuid: "one", status: "Missed" }, { ...base, uuid: "two", status: "Cancelled" }] as Appointment[];
    expect(detailedSummaryRows(appointments, "provider")).toEqual([{ rowLabel: "Dra. Soto", rowDataList: [{ date: "2026-08-14", uuid: "provider", count: 1, missedCount: 1 }] }]);
  });
});
