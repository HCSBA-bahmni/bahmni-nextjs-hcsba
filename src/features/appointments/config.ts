import { z } from "zod";
import { loadAppConfig } from "@/services/bahmni/config";
import { appointmentStatusSchema, type AppointmentAppConfig } from "./types";

const defaults: AppointmentAppConfig = {
  allowVirtualConsultation: false,
  enableAppointmentRequests: false,
  minCharLengthToTriggerPatientSearch: 3,
  enableSpecialities: true,
  maxAppointmentProviders: 4,
  startOfWeek: "Monday",
  calendarSlotDuration: "00:30",
  calendarSlotLabelInterval: "01:00",
  startOfDay: "09:00",
  endOfDay: "19:00",
  enableServiceTypes: false,
  enableCalendarView: true,
  isServiceOnAppointmentEditable: false,
  enableResetAppointmentStatuses: ["CheckedIn"],
  colorsForAppointmentService: ["#006400", "#DC143C", "#00008B", "#3F51B5"],
  allowedActions: ["CheckedIn", "Completed", "Missed", "Cancelled"],
  allowedActionsByStatus: {},
  colorsForListView: {},
  recurrence: { defaultNumberOfOccurrences: 10 },
  additionalInfoColumns: {},
  enableAppointmentStatusOption: true,
  enableDetailedSummaryView: true,
};

const configSchema = z.object({
  allowVirtualConsultation: z.boolean().default(defaults.allowVirtualConsultation),
  enableAppointmentRequests: z.boolean().default(defaults.enableAppointmentRequests),
  minCharLengthToTriggerPatientSearch: z.number().int().positive().default(defaults.minCharLengthToTriggerPatientSearch),
  enableSpecialities: z.boolean().default(defaults.enableSpecialities),
  maxAppointmentProviders: z.number().int().positive().default(defaults.maxAppointmentProviders),
  startOfWeek: z.enum(["Monday", "Sunday"]).default(defaults.startOfWeek),
  calendarSlotDuration: z.string().regex(/^\d{2}:\d{2}$/).default(defaults.calendarSlotDuration),
  calendarSlotLabelInterval: z.string().regex(/^\d{2}:\d{2}$/).default(defaults.calendarSlotLabelInterval),
  startOfDay: z.string().regex(/^\d{2}:\d{2}$/).default(defaults.startOfDay),
  endOfDay: z.string().regex(/^\d{2}:\d{2}$/).default(defaults.endOfDay),
  enableServiceTypes: z.boolean().default(defaults.enableServiceTypes),
  enableCalendarView: z.boolean().default(defaults.enableCalendarView),
  isServiceOnAppointmentEditable: z.boolean().default(defaults.isServiceOnAppointmentEditable),
  enableResetAppointmentStatuses: z.array(appointmentStatusSchema).default(defaults.enableResetAppointmentStatuses),
  colorsForAppointmentService: z.array(z.string()).default(defaults.colorsForAppointmentService),
  allowedActions: z.array(appointmentStatusSchema).default(defaults.allowedActions),
  allowedActionsByStatus: z.record(z.string(), z.array(appointmentStatusSchema)).default({}),
  colorsForListView: z.record(z.string(), z.string()).default({}),
  recurrence: z.object({ defaultNumberOfOccurrences: z.number().int().positive().default(10) }).default(defaults.recurrence),
  additionalInfoColumns: z.record(z.string(), z.string()).default({}),
  enableAppointmentStatusOption: z.boolean().default(defaults.enableAppointmentStatusOption),
  enableDetailedSummaryView: z.boolean().default(defaults.enableDetailedSummaryView),
}).strip();

export async function loadAppointmentConfig(): Promise<AppointmentAppConfig> {
  const app = await loadAppConfig("appointments");
  return configSchema.parse(app.config ?? {}) as AppointmentAppConfig;
}

export function minutesFromClock(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
