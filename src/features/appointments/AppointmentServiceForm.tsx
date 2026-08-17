import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getAppointmentService, loadAppointmentLocations, loadAppointmentServices, loadAppointmentSpecialities, saveAppointmentService } from "@/services/bahmni/appointments";
import { loadAppointmentConfig } from "./config";
import { displayName } from "./domain";
import { AppointmentNavigation } from "./AppointmentNavigation";
import { appointmentText } from "./translations";
import type { AppointmentAvailability, AppointmentService, AppointmentServicePayload } from "./types";

const days: Array<{ id: AppointmentAvailability["dayOfWeek"]; label: string }> = [
  { id: "MONDAY", label: "Lun" }, { id: "TUESDAY", label: "Mar" }, { id: "WEDNESDAY", label: "Mié" },
  { id: "THURSDAY", label: "Jue" }, { id: "FRIDAY", label: "Vie" }, { id: "SATURDAY", label: "Sáb" }, { id: "SUNDAY", label: "Dom" },
];

interface AvailabilityRow {
  startTime: string;
  endTime: string;
  maxAppointmentsLimit: string;
  selectedDays: AppointmentAvailability["dayOfWeek"][];
  dayUuids: Partial<Record<AppointmentAvailability["dayOfWeek"], string>>;
}

interface ServiceTypeRow { uuid?: string; name: string; duration: string; voided?: boolean }

interface FormState {
  name: string; description: string; durationMins: string; startTime: string; endTime: string; maxAppointmentsLimit: string;
  specialityUuid: string; locationUuid: string; color: string; initialAppointmentStatus: "" | "Scheduled" | "Requested";
  serviceTypes: ServiceTypeRow[]; weeklyAvailability: AvailabilityRow[];
}

const emptyForm: FormState = { name: "", description: "", durationMins: "", startTime: "", endTime: "", maxAppointmentsLimit: "", specialityUuid: "", locationUuid: "", color: "#008000", initialAppointmentStatus: "", serviceTypes: [], weeklyAvailability: [] };
const clock = (value?: string | null) => value?.slice(0, 5) ?? "";
const apiClock = (value: string) => value ? `${value}:00` : undefined;
const optionalNumber = (value: string) => value === "" ? undefined : Number(value);

function formFromService(service: AppointmentService): FormState {
  const groups = new Map<string, AvailabilityRow>();
  service.weeklyAvailability.filter((item) => !item.voided).forEach((item) => {
    const key = `${clock(item.startTime)}#${clock(item.endTime)}#${item.maxAppointmentsLimit ?? ""}`;
    const group = groups.get(key) ?? { startTime: clock(item.startTime), endTime: clock(item.endTime), maxAppointmentsLimit: item.maxAppointmentsLimit == null ? "" : String(item.maxAppointmentsLimit), selectedDays: [], dayUuids: {} };
    group.selectedDays.push(item.dayOfWeek);
    if (item.uuid) group.dayUuids[item.dayOfWeek] = item.uuid;
    groups.set(key, group);
  });
  return {
    name: displayName(service), description: service.description ?? "", durationMins: service.durationMins == null ? "" : String(service.durationMins),
    startTime: clock(service.startTime), endTime: clock(service.endTime), maxAppointmentsLimit: service.maxAppointmentsLimit == null ? "" : String(service.maxAppointmentsLimit),
    specialityUuid: service.speciality?.uuid ?? "", locationUuid: service.location?.uuid ?? "", color: service.color ?? "#008000",
    initialAppointmentStatus: service.initialAppointmentStatus ?? "", serviceTypes: service.serviceTypes.map((item) => ({ uuid: item.uuid, name: displayName(item), duration: item.duration == null ? "0" : String(item.duration), voided: item.voided })), weeklyAvailability: [...groups.values()],
  };
}

function toPayload(form: FormState, uuid?: string): AppointmentServicePayload {
  return {
    ...(uuid ? { uuid } : {}), name: form.name.trim(), ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(optionalNumber(form.durationMins) !== undefined ? { durationMins: optionalNumber(form.durationMins) } : {}),
    ...(optionalNumber(form.maxAppointmentsLimit) !== undefined ? { maxAppointmentsLimit: optionalNumber(form.maxAppointmentsLimit) } : {}),
    ...(form.color ? { color: form.color } : {}), ...(form.initialAppointmentStatus ? { initialAppointmentStatus: form.initialAppointmentStatus } : {}),
    ...(apiClock(form.startTime) ? { startTime: apiClock(form.startTime) } : {}), ...(apiClock(form.endTime) ? { endTime: apiClock(form.endTime) } : {}),
    ...(form.specialityUuid ? { specialityUuid: form.specialityUuid } : {}), ...(form.locationUuid ? { locationUuid: form.locationUuid } : {}),
    serviceTypes: form.serviceTypes.map((item) => ({ ...(item.uuid ? { uuid: item.uuid } : {}), name: item.name.trim(), duration: Number(item.duration || 0), ...(item.voided ? { voided: true } : {}) })),
    weeklyAvailability: form.weeklyAvailability.flatMap((row) => days.flatMap(({ id }) => row.selectedDays.includes(id) || row.dayUuids[id] ? [{ ...(row.dayUuids[id] ? { uuid: row.dayUuids[id] } : {}), dayOfWeek: id, startTime: apiClock(row.startTime)!, endTime: apiClock(row.endTime)!, ...(optionalNumber(row.maxAppointmentsLimit) !== undefined ? { maxAppointmentsLimit: optionalNumber(row.maxAppointmentsLimit) } : {}), ...(row.selectedDays.includes(id) ? {} : { voided: true }) }] : [])),
  };
}

export function AppointmentServiceForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canAdminister = hasPrivilege(user, "app:appointments:adminTab") || hasPrivilege(user, "app:admin");
  const routeUuid = typeof router.query.serviceUuid === "string" ? router.query.serviceUuid : undefined;
  const editing = Boolean(routeUuid);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initializedUuid, setInitializedUuid] = useState<string | null>();
  const [submitted, setSubmitted] = useState(false);
  const config = useQuery({ queryKey: ["appointments", "config"], queryFn: loadAppointmentConfig, enabled: canAdminister });
  const services = useQuery({ queryKey: ["appointments", "services"], queryFn: loadAppointmentServices, enabled: canAdminister });
  const locations = useQuery({ queryKey: ["appointments", "locations"], queryFn: loadAppointmentLocations, enabled: canAdminister });
  const specialities = useQuery({ queryKey: ["appointments", "specialities"], queryFn: loadAppointmentSpecialities, enabled: canAdminister && config.data?.enableSpecialities !== false });
  const service = useQuery({ queryKey: ["appointments", "admin", "service", routeUuid], queryFn: () => getAppointmentService(routeUuid!), enabled: canAdminister && editing && Boolean(routeUuid) });
  /* The REST response initializes the editable draft once per route UUID. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editing && service.data && initializedUuid !== routeUuid) { setForm(formFromService(service.data)); setInitializedUuid(routeUuid); }
    if (!editing && initializedUuid !== null) { setForm({ ...emptyForm, color: config.data?.colorsForAppointmentService[0] ?? "#008000" }); setInitializedUuid(null); }
  }, [config.data, editing, initializedUuid, routeUuid, service.data]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const duplicateName = useMemo(() => services.data?.some((item) => item.uuid !== routeUuid && displayName(item).trim().toLocaleLowerCase("es") === form.name.trim().toLocaleLowerCase("es")) ?? false, [form.name, routeUuid, services.data]);
  const availabilityInvalid = form.weeklyAvailability.some((row) => !row.startTime || !row.endTime || row.startTime >= row.endTime || row.selectedDays.length === 0);
  const availabilityOverlap = form.weeklyAvailability.some((row, index) => form.weeklyAvailability.some((other, otherIndex) => otherIndex > index && row.selectedDays.some((day) => other.selectedDays.includes(day)) && row.startTime < other.endTime && other.startTime < row.endTime));
  const activeServiceTypes = form.serviceTypes.filter((item) => !item.voided);
  const serviceTypesInvalid = activeServiceTypes.some((item, index) => !item.name.trim() || activeServiceTypes.some((other, otherIndex) => otherIndex !== index && other.name.trim().toLocaleLowerCase("es") === item.name.trim().toLocaleLowerCase("es")));
  const generalTimeInvalid = Boolean(form.startTime && form.endTime && form.startTime >= form.endTime);
  const save = useMutation({ mutationFn: (payload: AppointmentServicePayload) => saveAppointmentService(payload), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["appointments", "services"] }), queryClient.invalidateQueries({ queryKey: ["appointments", "admin"] })]); await router.push("/appointments/admin"); } });
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () => { setSubmitted(true); if (!form.name.trim() || duplicateName || availabilityInvalid || availabilityOverlap || serviceTypesInvalid || generalTimeInvalid) return; save.mutate(toPayload(form, routeUuid)); };
  const loading = config.isLoading || services.isLoading || locations.isLoading || editing && service.isLoading;
  const failed = config.isError || services.isError || locations.isError || editing && service.isError;

  return <AuthGuard><AppShell mainClassName="appointments-page appointment-admin-page">
    <header className="appointments-heading"><div><span className="clinical-eyebrow">HCSBA</span><h1>{appointmentText.module}</h1></div></header>
    <AppointmentNavigation active="admin" />
    {!canAdminister && <p role="alert" className="error-banner">No cuentas con el privilegio para administrar servicios de citas.</p>}
    {canAdminister && loading && <p role="status">Cargando servicio…</p>}
    {canAdminister && failed && <p role="alert" className="error-banner">No fue posible cargar la configuración del servicio.</p>}
    {canAdminister && !loading && !failed && <section className="panel appointment-service-form" aria-labelledby="service-form-title">
      <div className="appointment-admin-title"><h2 id="service-form-title">{editing ? "Editar servicio" : "Nuevo servicio"}</h2><div><Button outlined label="Cancelar" onClick={() => void router.push("/appointments/admin")} /><Button label="Guardar" icon="pi pi-save" loading={save.isPending} onClick={submit} /></div></div>
      <div className="appointment-service-form-grid">
        <div className="field"><label htmlFor="service-name">Nombre <span aria-hidden="true">*</span></label><InputText id="service-name" value={form.name} onChange={(event) => update("name", event.target.value)} invalid={submitted && (!form.name.trim() || duplicateName)} />{submitted && !form.name.trim() && <small className="field-error">El nombre es obligatorio.</small>}{duplicateName && <small className="field-error">Ya existe un servicio con este nombre.</small>}</div>
        {config.data?.enableAppointmentRequests && <div className="field"><label htmlFor="service-status">Estado inicial de la cita</label><select id="service-status" value={form.initialAppointmentStatus} onChange={(event) => update("initialAppointmentStatus", event.target.value as FormState["initialAppointmentStatus"])}><option value="">Predeterminado</option><option value="Scheduled">Scheduled</option><option value="Requested">Requested</option></select></div>}
        <div className="field appointment-service-description"><label htmlFor="service-description">Descripción</label><InputTextarea id="service-description" value={form.description} rows={3} onChange={(event) => update("description", event.target.value)} /></div>
        <div className="field"><label htmlFor="service-duration">Duración (minutos)</label><input id="service-duration" type="number" min="0" value={form.durationMins} onChange={(event) => update("durationMins", event.target.value)} /></div>
        <div className="field"><label htmlFor="service-start">Hora de inicio</label><input id="service-start" type="time" value={form.startTime} disabled={form.weeklyAvailability.length > 0} onChange={(event) => update("startTime", event.target.value)} /></div>
        <div className="field"><label htmlFor="service-end">Hora de término</label><input id="service-end" type="time" value={form.endTime} disabled={form.weeklyAvailability.length > 0} onChange={(event) => update("endTime", event.target.value)} />{generalTimeInvalid && <small className="field-error">La hora de término debe ser posterior al inicio.</small>}</div>
        <div className="field"><label htmlFor="service-limit">Cupo máximo</label><input id="service-limit" type="number" min="0" value={form.maxAppointmentsLimit} disabled={form.serviceTypes.some((item) => !item.voided) || form.weeklyAvailability.length > 0} onChange={(event) => update("maxAppointmentsLimit", event.target.value)} /></div>
        {config.data?.enableSpecialities && <div className="field"><label htmlFor="service-speciality">Especialidad</label><select id="service-speciality" value={form.specialityUuid} onChange={(event) => update("specialityUuid", event.target.value)}><option value="">Seleccione</option>{(specialities.data ?? []).slice().sort((a, b) => displayName(a).localeCompare(displayName(b), "es")).map((item) => <option key={item.uuid} value={item.uuid}>{displayName(item)}</option>)}</select></div>}
        <div className="field"><label htmlFor="service-location">Ubicación</label><select id="service-location" value={form.locationUuid} onChange={(event) => update("locationUuid", event.target.value)}><option value="">Seleccione</option>{(locations.data ?? []).map((item) => <option key={item.uuid} value={item.uuid}>{displayName(item)}</option>)}</select></div>
        {config.data?.enableCalendarView && <div className="field"><label htmlFor="service-color">Color en calendario</label><div className="appointment-color-field"><input id="service-color" type="color" value={form.color} onChange={(event) => update("color", event.target.value)} />{config.data.colorsForAppointmentService.map((color) => <button key={color} type="button" className={form.color.toLowerCase() === color.toLowerCase() ? "selected" : ""} style={{ backgroundColor: color }} aria-label={`Usar color ${color}`} onClick={() => update("color", color)} />)}</div></div>}
      </div>
      {config.data?.enableServiceTypes && <section className="appointment-service-subsection"><div className="appointment-subsection-title"><h3>Tipos de servicio</h3><Button outlined size="small" icon="pi pi-plus" label="Agregar tipo" onClick={() => update("serviceTypes", [...form.serviceTypes, { name: "", duration: "0" }])} /></div>{form.serviceTypes.filter((item) => !item.voided).map((item) => { const index = form.serviceTypes.indexOf(item); return <div className="appointment-service-type-row" key={item.uuid ?? index}><InputText aria-label="Nombre del tipo" placeholder="Nombre" value={item.name} onChange={(event) => update("serviceTypes", form.serviceTypes.map((current, i) => i === index ? { ...current, name: event.target.value } : current))} /><input aria-label="Duración del tipo" type="number" min="0" value={item.duration} onChange={(event) => update("serviceTypes", form.serviceTypes.map((current, i) => i === index ? { ...current, duration: event.target.value } : current))} /><Button text severity="danger" icon="pi pi-times" aria-label={`Quitar tipo ${item.name || index + 1}`} onClick={() => update("serviceTypes", item.uuid ? form.serviceTypes.map((current, i) => i === index ? { ...current, voided: true } : current) : form.serviceTypes.filter((_, i) => i !== index))} /></div>; })}</section>}
      <section className="appointment-service-subsection"><div className="appointment-subsection-title"><h3>Disponibilidad semanal</h3><Button outlined size="small" icon="pi pi-plus" label="Agregar disponibilidad" onClick={() => update("weeklyAvailability", [...form.weeklyAvailability, { startTime: "", endTime: "", maxAppointmentsLimit: "", selectedDays: [], dayUuids: {} }])} /></div>{form.weeklyAvailability.map((row, index) => <div className="appointment-availability-row" key={index}><div className="appointment-weekdays">{days.map((day) => <label key={day.id}><input type="checkbox" checked={row.selectedDays.includes(day.id)} onChange={(event) => update("weeklyAvailability", form.weeklyAvailability.map((current, i) => i === index ? { ...current, selectedDays: event.target.checked ? [...current.selectedDays, day.id] : current.selectedDays.filter((id) => id !== day.id) } : current))} />{day.label}</label>)}</div><label>Inicio<input type="time" value={row.startTime} onChange={(event) => update("weeklyAvailability", form.weeklyAvailability.map((current, i) => i === index ? { ...current, startTime: event.target.value } : current))} /></label><label>Término<input type="time" value={row.endTime} onChange={(event) => update("weeklyAvailability", form.weeklyAvailability.map((current, i) => i === index ? { ...current, endTime: event.target.value } : current))} /></label><label>Cupo<input type="number" min="0" value={row.maxAppointmentsLimit} disabled={form.serviceTypes.some((item) => !item.voided)} onChange={(event) => update("weeklyAvailability", form.weeklyAvailability.map((current, i) => i === index ? { ...current, maxAppointmentsLimit: event.target.value } : current))} /></label><Button text severity="danger" icon="pi pi-trash" aria-label={`Eliminar disponibilidad ${index + 1}`} onClick={() => update("weeklyAvailability", form.weeklyAvailability.filter((_, i) => i !== index))} />{submitted && (!row.startTime || !row.endTime || row.startTime >= row.endTime || !row.selectedDays.length) && <small className="field-error">Selecciona días y un horario válido.</small>}</div>)}</section>
      {submitted && serviceTypesInvalid && <p role="alert" className="error-banner">Cada tipo de servicio debe tener un nombre único.</p>}
      {submitted && availabilityOverlap && <p role="alert" className="error-banner">Las disponibilidades del mismo día no pueden superponerse.</p>}
      {save.isError && <p role="alert" className="error-banner">No fue posible guardar el servicio. Revisa los datos y vuelve a intentarlo.</p>}
    </section>}
  </AppShell></AuthGuard>;
}
