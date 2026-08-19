import { z } from "zod";
import { bahmniRequest, bahmniRequestWithResponse, queryString } from "./http";
import { searchPatients } from "./patients";
import {
  appointmentConflictSchema,
  appointmentConflictAppointmentSchema,
  appointmentProviderSchema,
  appointmentReferenceSchema,
  appointmentSchema,
  appointmentServiceSchema,
  appointmentSummarySchema,
  recurringAppointmentSchema,
  type Appointment,
  type AppointmentConflict,
  type AppointmentFilterSearchCriteria,
  type AppointmentPayload,
  type AppointmentProvider,
  type AppointmentSearchCriteria,
  type AppointmentServicePayload,
  type AppointmentStatus,
  type AppointmentSummary,
  type ProviderResponse,
  type RecurrenceDetails,
  type RecurringAppointment,
} from "@/features/appointments/types";

const resultList = <T extends z.ZodTypeAny>(item: T) => z.union([
  z.array(item),
  z.object({ results: z.array(item) }).loose().transform((value) => value.results),
  z.object({ appointments: z.array(item) }).loose().transform((value) => value.appointments),
]);

function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return bahmniRequest(path, { method: "POST", body: JSON.stringify(body), schema });
}

export async function searchAppointments(criteria: AppointmentSearchCriteria): Promise<Appointment[]> {
  return post("/ws/rest/v1/appointments/search", criteria, resultList(appointmentSchema));
}

export async function searchAppointmentsByFilters(criteria: AppointmentFilterSearchCriteria): Promise<Appointment[]> {
  return post("/ws/rest/v1/appointment/search", criteria, resultList(appointmentSchema));
}

export async function getAppointmentsForDate(forDate: string): Promise<Appointment[]> {
  return bahmniRequest(`/ws/rest/v1/appointment/all${queryString({ forDate })}`, { schema: resultList(appointmentSchema) });
}

export async function getAppointment(uuid: string): Promise<Appointment> {
  return bahmniRequest(`/ws/rest/v1/appointment/${queryString({ uuid })}`, { schema: appointmentSchema });
}

export async function getAppointmentSummary(startDate: string, endDate: string): Promise<AppointmentSummary[]> {
  return bahmniRequest(`/ws/rest/v1/appointment/appointmentSummary${queryString({ startDate, endDate })}`, { schema: z.array(appointmentSummarySchema) });
}

export async function saveAppointment(payload: AppointmentPayload): Promise<Appointment> {
  return post("/ws/rest/v1/appointment", payload, appointmentSchema);
}

export async function saveRecurringAppointments(payload: AppointmentPayload, recurrence: RecurrenceDetails): Promise<RecurringAppointment> {
  const responses = await post("/ws/rest/v1/recurring-appointments", recurringRequest(payload, recurrence), z.array(recurringAppointmentSchema));
  if (!responses[0]) throw new Error("OpenMRS no devolvió las citas recurrentes creadas.");
  return responses[0];
}

export async function findAppointmentConflicts(payload: AppointmentPayload): Promise<AppointmentConflict[]> {
  return appointmentConflicts("/ws/rest/v1/appointments/conflicts", payload);
}

export async function findRecurringConflicts(payload: AppointmentPayload, recurrence: RecurrenceDetails): Promise<AppointmentConflict[]> {
  return appointmentConflicts("/ws/rest/v1/recurring-appointments/conflicts", recurringRequest(payload, recurrence));
}

export async function changeAppointmentStatus(uuid: string, toStatus: AppointmentStatus, applyForAll: boolean, timeZone: string): Promise<Appointment> {
  const path = applyForAll
    ? `/ws/rest/v1/recurring-appointments/${encodeURIComponent(uuid)}/changeStatus`
    : `/ws/rest/v1/appointments/${encodeURIComponent(uuid)}/status-change`;
  if (applyForAll) {
    const responses = await post(path, { toStatus, onDate: new Date().toISOString(), applyForAll, timeZone }, z.array(recurringAppointmentSchema));
    const changed = responses.find((item) => item.appointmentDefaultResponse.uuid === uuid) ?? responses[0];
    if (!changed) throw new Error("OpenMRS no devolvió la cita actualizada.");
    return changed.appointmentDefaultResponse;
  }
  return post(path, { toStatus, onDate: new Date().toISOString(), applyForAll, timeZone }, appointmentSchema);
}

export async function changeProviderResponse(appointmentUuid: string, providerUuid: string, response: ProviderResponse): Promise<void> {
  await bahmniRequest<void>(`/ws/rest/v1/appointments/${encodeURIComponent(appointmentUuid)}/providerResponse`, {
    method: "POST", body: JSON.stringify({ uuid: providerUuid, response }),
  });
}

export async function loadAppointmentServices(): Promise<z.infer<typeof appointmentServiceSchema>[]> {
  return bahmniRequest("/ws/rest/v1/appointmentService/all/default", { schema: resultList(appointmentServiceSchema) });
}

export async function loadAppointmentServicesFull(): Promise<z.infer<typeof appointmentServiceSchema>[]> {
  return bahmniRequest("/ws/rest/v1/appointmentService/all/full", { schema: resultList(appointmentServiceSchema) });
}

export async function getAppointmentService(uuid: string): Promise<z.infer<typeof appointmentServiceSchema>> {
  return bahmniRequest(`/ws/rest/v1/appointmentService${queryString({ uuid })}`, { schema: appointmentServiceSchema });
}

export async function saveAppointmentService(payload: AppointmentServicePayload): Promise<z.infer<typeof appointmentServiceSchema>> {
  return post("/ws/rest/v1/appointmentService", payload, appointmentServiceSchema);
}

export async function deleteAppointmentService(uuid: string): Promise<void> {
  await bahmniRequest<void>(`/ws/rest/v1/appointmentService${queryString({ uuid })}`, { method: "DELETE" });
}

export async function loadAppointmentSpecialities(): Promise<z.infer<typeof appointmentReferenceSchema>[]> {
  return bahmniRequest("/ws/rest/v1/speciality/all", { schema: resultList(appointmentReferenceSchema) });
}

export async function loadAppointmentProviders(): Promise<AppointmentProvider[]> {
  const providers = await bahmniRequest(`/ws/rest/v1/provider${queryString({ v: "custom:(display,person,uuid,retired,attributes:(attributeType:(display),value,voided))", limit: 1000 })}`, { schema: resultList(appointmentProviderSchema) });
  return providers.filter((provider) => !provider.retired && provider.attributes?.some((attribute) => !attribute.voided && Boolean(attribute.value) && (attribute.attributeType.display ?? attribute.attributeType.name) === "Available for appointments"));
}

export async function loadAppointmentLocations() {
  const locations = await bahmniRequest(`/ws/rest/v1/location${queryString({ s: "byTags", tags: "Appointment Location", v: "default", operator: "ALL" })}`, { schema: resultList(appointmentReferenceSchema) });
  return locations;
}

export async function searchAppointmentPatients(query: string, loginLocationUuid?: string) {
  const response = await searchPatients({
    q: query,
    identifier: query,
    page: 1,
    pageSize: 20,
    locationUuid: loginLocationUuid,
    filterOnAllIdentifiers: true,
  });
  return response.results;
}

function recurringRequest(payload: AppointmentPayload, recurrence: RecurrenceDetails) {
  return {
    appointmentRequest: payload,
    recurringPattern: {
      type: "WEEK",
      period: 1,
      frequency: recurrence.numberOfOccurrences,
      daysOfWeek: recurrence.repeatOn,
    },
    applyForAll: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago",
  };
}

const conflictMapSchema = z.record(z.string(), z.array(appointmentConflictAppointmentSchema));

async function appointmentConflicts(path: string, body: unknown): Promise<AppointmentConflict[]> {
  const response = await bahmniRequestWithResponse<unknown>(path, { method: "POST", body: JSON.stringify(body) });
  if (response.status === 204 || response.data === undefined || response.data === "") return [];
  const legacy = resultList(appointmentConflictSchema).safeParse(response.data);
  if (legacy.success) return legacy.data;
  const conflicts = conflictMapSchema.parse(response.data);
  return Object.entries(conflicts).flatMap(([kind, appointments]) => appointments.map((appointment) => ({ uuid: appointment.uuid ?? undefined, message: kind, appointment })));
}
