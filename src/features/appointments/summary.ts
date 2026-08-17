import type { Appointment, AppointmentSummary } from "./types";
import { dateTimeOf, displayName } from "./domain";

export interface AppointmentSummaryCell {
  date: string;
  count: number;
  missedCount: number;
  uuid?: string;
}

export interface AppointmentSummaryRow {
  rowLabel: string;
  rowDataList: AppointmentSummaryCell[];
}

export type DetailedSummaryGroup = "speciality" | "provider" | "location";

export function serviceSummaryRows(items: AppointmentSummary[]): AppointmentSummaryRow[] {
  return items.map((item) => ({
    rowLabel: displayName(item.appointmentService),
    rowDataList: Object.entries(item.appointmentCountMap).map(([date, count]) => ({
      date,
      count: count.allAppointmentsCount,
      missedCount: count.missedAppointmentsCount,
      uuid: count.appointmentServiceUuid,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function detailedSummaryRows(appointments: Appointment[], group: DetailedSummaryGroup): AppointmentSummaryRow[] {
  const grouped = new Map<string, { name: string; cells: Map<string, AppointmentSummaryCell> }>();
  appointments.filter((appointment) => appointment.status !== "Cancelled").forEach((appointment) => {
    const references = group === "speciality"
      ? appointment.service.speciality ? [appointment.service.speciality] : []
      : group === "location"
        ? appointment.location ? [appointment.location] : []
        : appointment.provider ? [appointment.provider] : appointment.providers;
    const date = dateTimeOf(appointment.startDateTime).toISODate();
    if (!date) return;
    references.forEach((reference) => {
      const current = grouped.get(reference.uuid) ?? { name: displayName(reference), cells: new Map<string, AppointmentSummaryCell>() };
      const cell = current.cells.get(date) ?? { date, uuid: reference.uuid, count: 0, missedCount: 0 };
      cell.count += 1;
      if (appointment.status === "Missed") cell.missedCount += 1;
      current.cells.set(date, cell);
      grouped.set(reference.uuid, current);
    });
  });
  return [...grouped.values()].map((item) => ({ rowLabel: item.name, rowDataList: [...item.cells.values()] }))
    .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, "es"));
}
