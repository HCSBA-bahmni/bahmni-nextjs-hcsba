export type AppointmentRecord = Record<string, unknown>;
export interface DashboardAppointment { uuid: string; date: Date | null; slot: string; kind: string; status: string; link: string; details: AppointmentRecord; raw: AppointmentRecord }

function dateFrom(value: unknown): Date | null {
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value.map(Number);
    const date = new Date(year!, month! - 1, day!, hour, minute, second);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function normalizeAppointments(items: AppointmentRecord[], locale: string): DashboardAppointment[] {
  return items.map((item, index) => {
    const start = dateFrom(item.DASHBOARD_APPOINTMENTS_START_DATE_IN_UTC_KEY ?? item.DASHBOARD_APPOINTMENTS_START_DATE_KEY);
    const end = dateFrom(item.DASHBOARD_APPOINTMENTS_END_DATE_IN_UTC_KEY ?? item.DASHBOARD_APPOINTMENTS_END_DATE_KEY);
    const hidden = new Set(["uuid", "DASHBOARD_APPOINTMENTS_START_DATE_IN_UTC_KEY", "DASHBOARD_APPOINTMENTS_END_DATE_IN_UTC_KEY", "DASHBOARD_APPOINTMENTS_START_DATE_KEY", "DASHBOARD_APPOINTMENTS_END_DATE_KEY", "DASHBOARD_APPOINTMENTS_KIND", "tele_health_video_link"]);
    return {
      uuid: String(item.uuid ?? `appointment-${index}`),
      date: start,
      slot: start && end ? `${new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(start)} - ${new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(end)}` : "—",
      kind: String(item.DASHBOARD_APPOINTMENTS_KIND ?? ""),
      status: String(item.DASHBOARD_APPOINTMENTS_STATUS_KEY ?? item.status ?? ""),
      link: typeof item.tele_health_video_link === "string" ? item.tele_health_video_link : "",
      details: Object.fromEntries(Object.entries(item).filter(([key]) => !hidden.has(key))),
      raw: item,
    };
  });
}

export function appointmentMeetingUrl(appointment: DashboardAppointment, domain: string): string {
  if (appointment.link.trim()) return appointment.link.trim();
  const safeDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return safeDomain ? `https://${safeDomain}/${encodeURIComponent(appointment.uuid)}` : "";
}
