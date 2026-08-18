import { DateTime } from "luxon";
import type { Appointment, AppointmentAppConfig, AppointmentConflict, AppointmentStatus } from "./types";

export const APPOINTMENTS_TIME_ZONE = "America/Santiago";

export function dateTimeOf(value: Appointment["startDateTime"], zone = APPOINTMENTS_TIME_ZONE): DateTime {
  if (Array.isArray(value)) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value;
    return DateTime.fromObject({ year, month, day, hour, minute, second }, { zone });
  }
  if (typeof value === "number") return DateTime.fromMillis(value, { zone });
  return DateTime.fromISO(value, { zone: "utc" }).setZone(zone);
}

export function serverDateTime(value: Date | DateTime, zone = APPOINTMENTS_TIME_ZONE): string {
  const dateTime = DateTime.isDateTime(value) ? value.setZone(zone) : DateTime.fromJSDate(value, { zone });
  return dateTime.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

export function appointmentProviders(appointment: Appointment) {
  return appointment.providers.length ? appointment.providers : appointment.provider ? [appointment.provider] : [];
}

export function displayName(value: { display?: string; name?: string; person?: { display?: string } } | null | undefined): string {
  return value?.name ?? value?.person?.display ?? value?.display ?? "—";
}

export function patientName(appointment: Appointment): string {
  return displayName(appointment.patient);
}

export function providerNames(appointment: Appointment): string {
  const names = appointmentProviders(appointment).map(displayName).filter((name) => name !== "—");
  return names.length ? names.join(", ") : "Sin proveedor";
}

function conflictClock(value: string | null | undefined): string | undefined {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : undefined;
}

function requestedAppointmentRange(conflict: AppointmentConflict): string | undefined {
  const appointment = conflict.appointment;
  if (!appointment) return undefined;
  const start = dateTimeOf(appointment.startDateTime);
  const end = dateTimeOf(appointment.endDateTime);
  if (!start.isValid || !end.isValid) return undefined;
  return start.hasSame(end, "day")
    ? `el ${start.toFormat("dd/MM/yyyy")} de ${start.toFormat("HH:mm")} a ${end.toFormat("HH:mm")}`
    : `desde ${start.toFormat("dd/MM/yyyy HH:mm")} hasta ${end.toFormat("dd/MM/yyyy HH:mm")}`;
}

export function appointmentConflictMessage(conflict: AppointmentConflict): string {
  const kind = conflict.message?.trim();
  const appointment = conflict.appointment;
  const requested = requestedAppointmentRange(conflict);
  if (kind === "SERVICE_UNAVAILABLE") {
    const serviceName = displayName(appointment?.service);
    const weekday = appointment ? ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"][dateTimeOf(appointment.startDateTime).weekday - 1] : undefined;
    const weeklyAvailability = appointment?.service.weeklyAvailability.find((availability) => availability.dayOfWeek === weekday);
    const availableStart = conflictClock(appointment?.service.startTime) ?? conflictClock(weeklyAvailability?.startTime);
    const availableEnd = conflictClock(appointment?.service.endTime) ?? conflictClock(weeklyAvailability?.endTime);
    const availabilityText = availableStart && availableEnd
      ? `«${serviceName}» funciona en el siguiente horario: ${availableStart} a ${availableEnd}.`
      : `Revisa la disponibilidad configurada de «${serviceName}».`;
    const requestedText = requested ? ` La cita solicitada es ${requested}.` : "";
    return `Servicio no disponible. ${availabilityText}${requestedText}`;
  }
  if (kind === "PATIENT") return `El paciente ya tiene otra cita que se superpone${requested ? ` con el horario solicitado ${requested}` : " con el horario solicitado"}.`;
  if (kind && !/^[A-Z0-9_]+$/.test(kind)) return kind;
  if (appointment && requested) return `Existe un conflicto de disponibilidad ${requested} para ${displayName(appointment.service)}.`;
  return "Existe un conflicto de disponibilidad para el horario solicitado.";
}

export function allowedStatusActions(config: AppointmentAppConfig, status: AppointmentStatus): AppointmentStatus[] {
  return (config.allowedActionsByStatus[status] ?? []).filter((action) => config.allowedActions.includes(action));
}

export interface AppointmentCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  appointment: Appointment;
  appointments: Appointment[];
  color: string;
}

export function calendarEvents(appointments: Appointment[], colors: string[], zone = APPOINTMENTS_TIME_ZONE): AppointmentCalendarEvent[] {
  const serviceColors = new Map<string, string>();
  const raw = appointments.flatMap((appointment) => {
    if (!serviceColors.has(appointment.service.uuid)) serviceColors.set(appointment.service.uuid, appointment.service.color ?? colors[serviceColors.size % Math.max(colors.length, 1)] ?? "#3F51B5");
    const providers = appointmentProviders(appointment);
    const resources = providers.length ? providers.map((provider) => provider.uuid) : ["unassigned"];
    return resources.map((resourceId) => ({
      id: `${appointment.uuid}-${resourceId}`,
      title: `${patientName(appointment)}${appointment.patient.identifier ? ` (${appointment.patient.identifier})` : ""} - ${displayName(appointment.service)}`,
      start: dateTimeOf(appointment.startDateTime, zone).toJSDate(),
      end: dateTimeOf(appointment.endDateTime, zone).toJSDate(),
      resourceId,
      appointment,
      appointments: [appointment],
      color: serviceColors.get(appointment.service.uuid)!,
    }));
  });
  const grouped = new Map<string, AppointmentCalendarEvent>();
  raw.forEach((event) => {
    const key = `${event.resourceId}|${event.start.toISOString()}|${event.end.toISOString()}|${event.appointment.service.uuid}|${event.color}`;
    const current = grouped.get(key);
    if (!current) grouped.set(key, event);
    else {
      current.appointments.push(event.appointment);
      current.title = current.appointments.map(patientName).join(" / ");
      current.id = `${current.appointments.map((item) => item.uuid).join("-")}-${event.resourceId}`;
    }
  });
  return [...grouped.values()];
}

export function statusLabel(status: AppointmentStatus): string {
  return ({ Requested: "Solicitada", Scheduled: "Programada", CheckedIn: "Admitida", Completed: "Completada", Cancelled: "Cancelada", Missed: "Ausente", WaitList: "Lista de espera" } as const)[status];
}

export function canManageAppointments(privileges: ReadonlySet<string>): boolean {
  return privileges.has("app:appointments:manageAppointmentsTab");
}

export function canManageOwnAppointments(privileges: ReadonlySet<string>): boolean {
  return privileges.has("Manage Own Appointments");
}

export function canEditAppointment(appointment: Appointment, currentProviderUuid: string | undefined, privileges: ReadonlySet<string>): boolean {
  if (canManageAppointments(privileges)) return true;
  if (!canManageOwnAppointments(privileges)) return false;
  const providers = appointmentProviders(appointment);
  if (!providers.length) return true;
  const mine = providers.find((provider) => provider.uuid === currentProviderUuid);
  return mine?.response === "ACCEPTED" || !providers.some((provider) => provider.response === "ACCEPTED");
}
