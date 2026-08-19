import { describe, expect, it } from "vitest";
import { allowedStatusActions, appointmentConflictMessage, calendarEvents, canEditAppointment, dateTimeOf, serverDateTime } from "./domain";
import { appointmentSchema } from "./types";
import type { Appointment, AppointmentAppConfig } from "./types";

const appointment = {
  uuid: "appointment-1",
  patient: { uuid: "patient-1", display: "Ana Pérez", identifier: "HCSBA-1" },
  service: { uuid: "service-1", name: "Cardiología", serviceTypes: [], weeklyAvailability: [] },
  providers: [{ uuid: "provider-1", display: "Dra. Soto", response: "ACCEPTED" }],
  provider: null,
  location: { uuid: "location-1", name: "Box 1" },
  startDateTime: [2026, 9, 6, 9, 30], endDateTime: [2026, 9, 6, 10, 0], status: "Scheduled",
  appointmentKind: "Scheduled", teleconsultation: false, comments: null, additionalInfo: {}, extensions: {}, serviceType: null,
} as Appointment;

const config = {
  allowedActions: ["CheckedIn", "Completed", "Missed", "Cancelled"],
  allowedActionsByStatus: { Scheduled: ["CheckedIn", "Missed", "Cancelled"] },
} as AppointmentAppConfig;

describe("appointment domain parity", () => {
  it("maps date arrays and providers to calendar resources", () => {
    const [event] = calendarEvents([appointment], ["#006400"]);
    expect(event).toMatchObject({ id: "appointment-1-provider-1", resourceId: "provider-1", title: "Ana Pérez (HCSBA-1) - Cardiología", color: "#006400" });
    expect(dateTimeOf(appointment.startDateTime).toFormat("HH:mm")).toBe("09:30");
  });

  it("preserves the Chile wall time when serializing through UTC", () => {
    expect(serverDateTime(dateTimeOf([2026, 9, 6, 9, 30]))).toMatch(/^2026-09-06T1[23]:30:00\.000Z$/);
  });

  it("explains service availability conflicts with requested and configured hours", () => {
    expect(appointmentConflictMessage({
      message: "SERVICE_UNAVAILABLE",
      appointment: {
        ...appointment,
        uuid: null,
        service: { ...appointment.service, name: "awa", startTime: "14:00:00", endTime: "18:00:00" },
        startDateTime: Date.parse("2026-08-14T16:00:00.000Z"),
        endDateTime: Date.parse("2026-08-14T17:30:00.000Z"),
      },
    })).toBe("Servicio no disponible. «awa» funciona en el siguiente horario: 14:00 a 18:00. La cita solicitada es el 14/08/2026 de 12:00 a 13:30.");
  });

  it("prefers every active weekly interval and ignores general and voided hours", () => {
    const message = appointmentConflictMessage({
      message: "SERVICE_UNAVAILABLE",
      appointment: {
        ...appointment,
        uuid: null,
        service: {
          ...appointment.service,
          name: "Cardiología",
          startTime: "01:00:00",
          endTime: "02:00:00",
          weeklyAvailability: [
            { dayOfWeek: "FRIDAY", startTime: "08:00:00", endTime: "12:00:00" },
            { dayOfWeek: "FRIDAY", startTime: "14:00:00", endTime: "18:00:00" },
            { dayOfWeek: "FRIDAY", startTime: "20:00:00", endTime: "21:00:00", voided: true },
            { dayOfWeek: "MONDAY", startTime: "10:00:00", endTime: "11:00:00" },
          ],
        },
        startDateTime: Date.parse("2026-08-14T16:00:00.000Z"),
        endDateTime: Date.parse("2026-08-14T17:30:00.000Z"),
      },
    });
    expect(message).toContain("los siguientes horarios: 08:00 a 12:00 y 14:00 a 18:00");
    expect(message).not.toContain("01:00");
    expect(message).not.toContain("20:00");
    expect(message).not.toContain("10:00");
  });

  it("uses a clear fallback when OpenMRS provides no service hours", () => {
    expect(appointmentConflictMessage({
      message: "SERVICE_UNAVAILABLE",
      appointment: { ...appointment, uuid: null, service: { ...appointment.service, name: "Cardiología", startTime: null, endTime: null, weeklyAvailability: [] } },
    })).toContain("Revisa la disponibilidad configurada de «Cardiología».");
  });

  it("identifies the existing appointment in patient conflicts", () => {
    expect(appointmentConflictMessage({
      message: "PATIENT",
      appointment: { ...appointment, uuid: "existing", startDateTime: Date.parse("2026-08-14T16:00:00.000Z"), endDateTime: Date.parse("2026-08-14T17:30:00.000Z") },
    })).toBe("El paciente ya tiene otra cita el 14/08/2026 de 12:00 a 13:30.");
  });

  it("uses configured transitions and exact legacy privileges", () => {
    expect(allowedStatusActions(config, "Scheduled")).toEqual(["CheckedIn", "Missed", "Cancelled"]);
    expect(canEditAppointment(appointment, "provider-1", new Set(["Manage Own Appointments"]))).toBe(true);
    expect(canEditAppointment(appointment, "provider-2", new Set(["Manage Own Appointments"]))).toBe(false);
    expect(canEditAppointment(appointment, undefined, new Set(["app:appointments:manageAppointmentsTab"]))).toBe(true);
  });

  it("normalizes nullable fields returned by the deployed OpenMRS representation", () => {
    const parsed = appointmentSchema.parse({
      uuid: "appointment", patient: { uuid: "patient", name: "Paciente" },
      service: { uuid: "service", name: "Servicio", color: null, durationMins: 15 },
      providers: [{ uuid: "provider", name: "Profesional", response: "ACCEPTED", comments: null }],
      provider: null, serviceType: null, startDateTime: 1786723200000, endDateTime: 1786725000000,
      status: "Scheduled", appointmentKind: "Virtual", teleconsultation: null,
      teleconsultationLink: "https://meet.example.test/appointment", additionalInfo: null,
      extensions: { patientEmailDefined: false }, priority: null,
    });
    expect(parsed.teleconsultation).toBe(false);
    expect(parsed.additionalInfo).toEqual({});
    expect(parsed.service.color).toBeNull();
    expect(parsed.providers[0]!.comments).toBeNull();
    expect(parsed.appointmentKind).toBe("Virtual");
    expect(parsed.teleconsultationLink).toBe("https://meet.example.test/appointment");
  });
});
