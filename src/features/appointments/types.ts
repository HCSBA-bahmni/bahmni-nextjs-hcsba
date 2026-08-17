import { z } from "zod";

export const appointmentStatuses = ["Requested", "Scheduled", "CheckedIn", "Completed", "Cancelled", "Missed", "WaitList"] as const;
export const providerResponses = ["ACCEPTED", "REJECTED", "TENTATIVE", "CANCELLED", "AWAITING"] as const;
export const appointmentStatusSchema = z.enum(appointmentStatuses);
export const providerResponseSchema = z.enum(providerResponses);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export const appointmentReferenceSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
  display: z.string().optional(),
}).loose();

const nullableAppointmentReferenceSchema = z.preprocess(
  (value) => value && typeof value === "object" && !("uuid" in value) ? null : value,
  appointmentReferenceSchema.nullish(),
);

export const appointmentPatientSchema = appointmentReferenceSchema.extend({
  identifier: z.string().optional(),
  person: z.object({ display: z.string().optional() }).loose().optional(),
}).loose();

export const appointmentProviderSchema = appointmentReferenceSchema.extend({
  response: providerResponseSchema.catch("AWAITING").optional(),
  comments: z.string().nullish(),
  person: z.object({ display: z.string().optional() }).loose().optional(),
  retired: z.boolean().optional(),
  attributes: z.array(z.object({
    value: z.unknown().optional(),
    voided: z.boolean().optional(),
    attributeType: z.object({ display: z.string().optional(), name: z.string().optional() }).loose(),
  }).loose()).optional(),
}).loose();

export const appointmentServiceTypeSchema = appointmentReferenceSchema.extend({
  duration: z.number().nullish(),
  voided: z.boolean().optional(),
}).loose();

export const appointmentAvailabilitySchema = z.object({
  uuid: z.string().optional(),
  dayOfWeek: z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]),
  startTime: z.string(),
  endTime: z.string(),
  maxAppointmentsLimit: z.number().nullish(),
  voided: z.boolean().optional(),
}).loose();

export const appointmentServiceSchema = appointmentReferenceSchema.extend({
  description: z.string().nullish(),
  color: z.string().nullish(),
  durationMins: z.number().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  maxAppointmentsLimit: z.number().nullish(),
  initialAppointmentStatus: z.enum(["Scheduled", "Requested"]).nullish(),
  speciality: nullableAppointmentReferenceSchema,
  location: nullableAppointmentReferenceSchema,
  serviceTypes: z.array(appointmentServiceTypeSchema).default([]),
  weeklyAvailability: z.array(appointmentAvailabilitySchema).default([]),
}).loose();

export const appointmentSchema = z.object({
  uuid: z.string(),
  patient: appointmentPatientSchema,
  service: appointmentServiceSchema,
  serviceType: appointmentServiceTypeSchema.nullish(),
  providers: z.array(appointmentProviderSchema).default([]),
  provider: appointmentProviderSchema.nullish(),
  location: appointmentReferenceSchema.nullish(),
  startDateTime: z.union([z.string(), z.number(), z.array(z.number())]),
  endDateTime: z.union([z.string(), z.number(), z.array(z.number())]),
  status: appointmentStatusSchema.catch("Scheduled"),
  appointmentKind: z.string().default("Scheduled"),
  teleconsultation: z.boolean().nullish().transform((value) => value ?? false),
  teleconsultationLink: z.string().nullish(),
  comments: z.string().nullish(),
  additionalInfo: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? {}),
  extensions: z.record(z.string(), z.unknown()).nullish().transform((value) => value ?? {}),
  priority: z.string().nullish(),
  recurring: z.boolean().optional(),
  recurringAppointment: appointmentReferenceSchema.nullish(),
}).loose();

export const appointmentConflictSchema = z.object({
  uuid: z.string().optional(),
  message: z.string().optional(),
  appointment: appointmentSchema.optional(),
}).loose();

export const appointmentSummaryCountSchema = z.object({
  allAppointmentsCount: z.number(),
  missedAppointmentsCount: z.number(),
  appointmentDate: z.union([z.string(), z.number()]).optional(),
  appointmentServiceUuid: z.string(),
}).loose();

export const appointmentSummarySchema = z.object({
  appointmentService: appointmentServiceSchema,
  appointmentCountMap: z.record(z.string(), appointmentSummaryCountSchema),
}).loose();

export const recurringAppointmentSchema = z.object({
  appointmentDefaultResponse: appointmentSchema,
  recurringPattern: z.object({
    id: z.number().optional(),
    frequency: z.number().nullish(),
    period: z.number(),
    endDate: z.union([z.string(), z.number()]).nullish(),
    type: z.enum(["DAY", "WEEK"]),
    daysOfWeek: z.array(z.string()).default([]),
  }).loose(),
}).loose();

export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentPatient = z.infer<typeof appointmentPatientSchema>;
export type AppointmentProvider = z.infer<typeof appointmentProviderSchema>;
export type AppointmentService = z.infer<typeof appointmentServiceSchema>;
export type AppointmentServiceType = z.infer<typeof appointmentServiceTypeSchema>;
export type AppointmentAvailability = z.infer<typeof appointmentAvailabilitySchema>;
export type AppointmentLocation = z.infer<typeof appointmentReferenceSchema>;
export type AppointmentConflict = z.infer<typeof appointmentConflictSchema>;
export type AppointmentSummary = z.infer<typeof appointmentSummarySchema>;
export type RecurringAppointment = z.infer<typeof recurringAppointmentSchema>;

export interface AppointmentPayload {
  uuid?: string;
  patientUuid: string;
  serviceUuid: string;
  serviceTypeUuid?: string;
  startDateTime: string;
  endDateTime: string;
  providerUuid?: string;
  providers: Array<{ uuid: string; response: ProviderResponse; comments?: string }>;
  locationUuid?: string;
  status: AppointmentStatus;
  appointmentKind: string;
  teleconsultation: boolean;
  comments?: string;
}

export interface AppointmentServicePayload {
  uuid?: string;
  name: string;
  description?: string;
  durationMins?: number;
  maxAppointmentsLimit?: number;
  color?: string;
  initialAppointmentStatus?: "Scheduled" | "Requested";
  startTime?: string;
  endTime?: string;
  specialityUuid?: string;
  locationUuid?: string;
  weeklyAvailability: Array<{
    uuid?: string;
    dayOfWeek: AppointmentAvailability["dayOfWeek"];
    startTime: string;
    endTime: string;
    maxAppointmentsLimit?: number;
    voided?: boolean;
  }>;
  serviceTypes: Array<{ uuid?: string; name: string; duration: number; voided?: boolean }>;
}

export interface AppointmentSearchCriteria {
  startDate: string;
  endDate: string;
  patientUuid?: string;
  providerUuid?: string;
  status?: AppointmentStatus;
  limit?: number;
}

export interface AppointmentFilterSearchCriteria {
  patientUuids?: string[];
  serviceUuids?: string[];
  serviceTypeUuids?: string[];
  providerUuids?: string[];
  locationUuids?: string[];
  status?: AppointmentStatus;
  appointmentKind?: string;
  priorities?: string[];
  withoutDates?: boolean;
}

export interface RecurrenceDetails {
  repeatOn: string[];
  numberOfOccurrences: number;
}

export interface AppointmentAppConfig {
  allowVirtualConsultation: boolean;
  enableAppointmentRequests: boolean;
  minCharLengthToTriggerPatientSearch: number;
  enableSpecialities: boolean;
  maxAppointmentProviders: number;
  startOfWeek: "Monday" | "Sunday";
  calendarSlotDuration: string;
  calendarSlotLabelInterval: string;
  startOfDay: string;
  endOfDay: string;
  enableServiceTypes: boolean;
  enableCalendarView: boolean;
  isServiceOnAppointmentEditable: boolean;
  enableResetAppointmentStatuses: AppointmentStatus[];
  colorsForAppointmentService: string[];
  allowedActions: AppointmentStatus[];
  allowedActionsByStatus: Partial<Record<AppointmentStatus, AppointmentStatus[]>>;
  colorsForListView: Partial<Record<AppointmentStatus, string>>;
  recurrence: { defaultNumberOfOccurrences: number };
  additionalInfoColumns: Record<string, string>;
  enableAppointmentStatusOption: boolean;
  enableDetailedSummaryView: boolean;
}
