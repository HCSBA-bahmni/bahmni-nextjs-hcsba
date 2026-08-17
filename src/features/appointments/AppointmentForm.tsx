import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { DateTime } from "luxon";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Checkbox } from "primereact/checkbox";
import { InputNumber } from "primereact/inputnumber";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { findAppointmentConflicts, findRecurringConflicts, getAppointment, loadAppointmentLocations, loadAppointmentProviders, loadAppointmentServices, saveAppointment, saveRecurringAppointments, searchAppointmentPatients } from "@/services/bahmni/appointments";
import { loadAppointmentConfig } from "./config";
import { APPOINTMENTS_TIME_ZONE, canEditAppointment, canManageAppointments, canManageOwnAppointments, dateTimeOf, displayName, serverDateTime, statusLabel } from "./domain";
import { AppointmentNavigation } from "./AppointmentNavigation";
import { appointmentText } from "./translations";
import type { Appointment, AppointmentConflict, AppointmentPatient, AppointmentPayload, AppointmentStatus, RecurrenceDetails } from "./types";

interface FormState {
  patientUuid: string;
  serviceUuid: string;
  serviceTypeUuid: string;
  providerUuids: string[];
  locationUuid: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  appointmentKind: string;
  teleconsultation: boolean;
  comments: string;
  recurring: boolean;
  occurrences: number;
  repeatOn: string[];
}

const today = DateTime.now().setZone(APPOINTMENTS_TIME_ZONE);
const initialState: FormState = {
  patientUuid: "", serviceUuid: "", serviceTypeUuid: "", providerUuids: [], locationUuid: "",
  date: today.toISODate()!, startTime: "09:00", endTime: "09:30", status: "Scheduled", appointmentKind: "Scheduled",
  teleconsultation: false, comments: "", recurring: false, occurrences: 10, repeatOn: [],
};

function fromAppointment(appointment: Appointment): FormState {
  const start = dateTimeOf(appointment.startDateTime);
  const end = dateTimeOf(appointment.endDateTime);
  return {
    patientUuid: appointment.patient.uuid, serviceUuid: appointment.service.uuid, serviceTypeUuid: appointment.serviceType?.uuid ?? "",
    providerUuids: (appointment.providers.length ? appointment.providers : appointment.provider ? [appointment.provider] : []).map((provider) => provider.uuid),
    locationUuid: appointment.location?.uuid ?? "", date: start.toISODate()!, startTime: start.toFormat("HH:mm"), endTime: end.toFormat("HH:mm"),
    status: appointment.status, appointmentKind: appointment.appointmentKind, teleconsultation: appointment.teleconsultation,
    comments: appointment.comments ?? "", recurring: false, occurrences: 1, repeatOn: [],
  };
}

function patientLabel(patient: Partial<AppointmentPatient> & { givenName?: string; familyName?: string; name?: string }): string {
  return patient.name ?? patient.display ?? patient.person?.display ?? ([patient.givenName, patient.familyName].filter(Boolean).join(" ") || "Paciente");
}

const recurrenceDays: Array<[string, string]> = [["MONDAY", "Lun"], ["TUESDAY", "Mar"], ["WEDNESDAY", "Mié"], ["THURSDAY", "Jue"], ["FRIDAY", "Vie"], ["SATURDAY", "Sáb"], ["SUNDAY", "Dom"]];

interface AppointmentFormProps {
  appointmentUuid?: string;
  embedded?: boolean;
  initialSlot?: { start: Date; end: Date; providerUuid?: string | null };
  onCancel?: () => void;
  onSaved?: () => void | Promise<void>;
}

export function AppointmentForm({ appointmentUuid, embedded = false, initialSlot, onCancel, onSaved }: AppointmentFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, provider, location } = useAuth();
  const loginLocationUuid = location?.uuid;
  const [form, setForm] = useState<FormState>(initialState);
  const [patient, setPatient] = useState<(Partial<AppointmentPatient> & { givenName?: string; familyName?: string; name?: string }) | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<Array<Partial<AppointmentPatient> & { uuid: string; givenName?: string; familyName?: string; name?: string }>>([]);
  const [patientError, setPatientError] = useState("");
  const [patientSearching, setPatientSearching] = useState(false);
  const [patientSearchAttempted, setPatientSearchAttempted] = useState(false);
  const patientSearchSequence = useRef(0);
  const [conflicts, setConflicts] = useState<AppointmentConflict[]>([]);
  const [formError, setFormError] = useState("");
  const config = useQuery({ queryKey: ["appointments", "config"], queryFn: loadAppointmentConfig });
  const services = useQuery({ queryKey: ["appointments", "services"], queryFn: loadAppointmentServices });
  const providers = useQuery({ queryKey: ["appointments", "providers"], queryFn: loadAppointmentProviders });
  const locations = useQuery({ queryKey: ["appointments", "locations"], queryFn: loadAppointmentLocations });
  const existing = useQuery({ queryKey: ["appointments", "detail", appointmentUuid], queryFn: () => getAppointment(appointmentUuid!), enabled: Boolean(appointmentUuid) });
  const selectedService = services.data?.find((service) => service.uuid === form.serviceUuid);
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((entry) => entry.name ?? entry.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const canManage = canManageAppointments(privilegeNames);
  const canManageOwn = canManageOwnAppointments(privilegeNames);
  const authorized = hasPrivilege(user, "app:appointments") && (canManage || canManageOwn) && (!existing.data || canEditAppointment(existing.data, provider?.uuid, privilegeNames));
  const visibleProviders = canManage ? providers.data ?? [] : (providers.data ?? []).filter((entry) => entry.uuid === provider?.uuid);

  useEffect(() => {
    if (!existing.data) return;
    const timer = window.setTimeout(() => { setForm(fromAppointment(existing.data!)); setPatient(existing.data!.patient); }, 0);
    return () => window.clearTimeout(timer);
  }, [existing.data]);

  useEffect(() => {
    if (!router.isReady || appointmentUuid) return;
    const start = initialSlot ? DateTime.fromJSDate(initialSlot.start, { zone: APPOINTMENTS_TIME_ZONE }) : typeof router.query.start === "string" ? DateTime.fromISO(router.query.start).setZone(APPOINTMENTS_TIME_ZONE) : null;
    const end = initialSlot ? DateTime.fromJSDate(initialSlot.end, { zone: APPOINTMENTS_TIME_ZONE }) : typeof router.query.end === "string" ? DateTime.fromISO(router.query.end).setZone(APPOINTMENTS_TIME_ZONE) : null;
    const selectedProvider = initialSlot?.providerUuid === null
      ? undefined
      : initialSlot?.providerUuid ?? (typeof router.query.provider === "string" ? router.query.provider : provider?.uuid);
    const providerUuids = initialSlot?.providerUuid === null ? [] : selectedProvider ? [selectedProvider] : undefined;
    const timer = window.setTimeout(() => setForm((current) => ({ ...current, ...(start?.isValid ? { date: start.toISODate()!, startTime: start.toFormat("HH:mm") } : {}), ...(end?.isValid ? { endTime: end.toFormat("HH:mm") } : {}), ...(providerUuids ? { providerUuids } : {}) })), 0);
    return () => window.clearTimeout(timer);
  }, [appointmentUuid, initialSlot, provider?.uuid, router.isReady, router.query.end, router.query.provider, router.query.start]);

  useEffect(() => {
    if (!config.data || appointmentUuid) return;
    const timer = window.setTimeout(() => setForm((current) => ({ ...current, occurrences: config.data!.recurrence.defaultNumberOfOccurrences })), 0);
    return () => window.clearTimeout(timer);
  }, [appointmentUuid, config.data]);

  const recurrence = useMemo<RecurrenceDetails>(() => ({ repeatOn: form.repeatOn.length ? form.repeatOn : [DateTime.fromISO(form.date).toFormat("cccc").toUpperCase()], numberOfOccurrences: form.occurrences }), [form.date, form.occurrences, form.repeatOn]);

  const mutation = useMutation({
    mutationFn: async () => {
      setFormError(""); setConflicts([]);
      if (!form.patientUuid || !form.serviceUuid || !form.date || !form.startTime || !form.endTime) throw new Error("Completa paciente, servicio, fecha y horario.");
      const start = DateTime.fromISO(`${form.date}T${form.startTime}`, { zone: APPOINTMENTS_TIME_ZONE });
      const end = DateTime.fromISO(`${form.date}T${form.endTime}`, { zone: APPOINTMENTS_TIME_ZONE });
      if (!start.isValid || !end.isValid || end <= start) throw new Error("El horario de término debe ser posterior al inicio.");
      const currentProviders = existing.data?.providers ?? [];
      const payload: AppointmentPayload = {
        ...(appointmentUuid ? { uuid: appointmentUuid } : {}), patientUuid: form.patientUuid, serviceUuid: form.serviceUuid,
        ...(form.serviceTypeUuid ? { serviceTypeUuid: form.serviceTypeUuid } : {}), startDateTime: serverDateTime(start), endDateTime: serverDateTime(end),
        ...(form.providerUuids.length === 1 ? { providerUuid: form.providerUuids[0] } : {}),
        providers: form.providerUuids.map((uuid) => ({ uuid, response: currentProviders.find((entry) => entry.uuid === uuid)?.response ?? "ACCEPTED", comments: currentProviders.find((entry) => entry.uuid === uuid)?.comments ?? undefined })),
        ...(form.locationUuid ? { locationUuid: form.locationUuid } : {}), status: form.status, appointmentKind: form.appointmentKind,
        teleconsultation: form.teleconsultation, ...(form.comments.trim() ? { comments: form.comments.trim() } : {}),
      };
      const found = form.recurring && !appointmentUuid ? await findRecurringConflicts(payload, recurrence) : await findAppointmentConflicts(payload);
      if (found.length) { setConflicts(found); throw new Error(appointmentText.conflict); }
      return form.recurring && !appointmentUuid ? saveRecurringAppointments(payload, recurrence) : saveAppointment(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (onSaved) {
        await onSaved();
        return;
      }
      const returnTo = typeof router.query.returnTo === "string" && router.query.returnTo.startsWith("/appointments") ? router.query.returnTo : "/appointments/calendar";
      await router.push(returnTo);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : appointmentText.saveError),
  });

  const searchPatient = useCallback(async (rawQuery: string) => {
    const sequence = ++patientSearchSequence.current;
    const query = rawQuery.trim();
    const minimumLength = config.data?.minCharLengthToTriggerPatientSearch ?? 3;
    setPatientError("");
    if (query.length < minimumLength) { setPatientResults([]); setPatientSearchAttempted(false); setPatientError(`Ingresa al menos ${minimumLength} caracteres.`); return; }
    setPatientSearching(true);
    setPatientSearchAttempted(true);
    try {
      const results = await searchAppointmentPatients(query, loginLocationUuid);
      if (sequence === patientSearchSequence.current) setPatientResults(results);
    } catch {
      if (sequence === patientSearchSequence.current) { setPatientResults([]); setPatientError("No fue posible buscar pacientes."); }
    } finally {
      if (sequence === patientSearchSequence.current) setPatientSearching(false);
    }
  }, [config.data?.minCharLengthToTriggerPatientSearch, loginLocationUuid]);

  useEffect(() => {
    if (patient || appointmentUuid || patientQuery.trim().length < (config.data?.minCharLengthToTriggerPatientSearch ?? 3)) return;
    const timer = window.setTimeout(() => void searchPatient(patientQuery), 350);
    return () => window.clearTimeout(timer);
  }, [appointmentUuid, config.data?.minCharLengthToTriggerPatientSearch, patient, patientQuery, searchPatient]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const busy = config.isLoading || services.isLoading || providers.isLoading || locations.isLoading || existing.isLoading;
  const cancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    void router.push(typeof router.query.returnTo === "string" && router.query.returnTo.startsWith("/appointments") ? router.query.returnTo : "/appointments/calendar");
  };
  const content = <>
    {busy && <p role="status">Cargando formulario…</p>}
    {!busy && !authorized && <p role="alert" className="error-banner">No cuentas con permisos para crear o editar esta cita.</p>}
    {!busy && authorized && config.data && <form className="panel appointment-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <section className="appointment-patient-picker"><h2>Paciente</h2>{patient ? <div className="selected-patient"><div><strong>{patientLabel(patient)}</strong><span>{patient.identifier ?? "Sin identificador"}</span></div>{!appointmentUuid && <Button type="button" text label="Cambiar" onClick={() => { patientSearchSequence.current += 1; setPatientSearching(false); setPatient(null); set("patientUuid", ""); setPatientQuery(""); setPatientSearchAttempted(false); }} />}</div> : <><div className="p-inputgroup"><InputText type="search" value={patientQuery} placeholder="Nombre o identificador" onChange={(event) => { patientSearchSequence.current += 1; setPatientSearching(false); setPatientQuery(event.target.value); setPatientResults([]); setPatientError(""); setPatientSearchAttempted(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchPatient(patientQuery); } }} /><Button type="button" icon="pi pi-search" label="Buscar" loading={patientSearching} disabled={patientSearching} onClick={() => void searchPatient(patientQuery)} /></div>{patientError && <small role="alert" className="field-error">{patientError}</small>}{patientSearching && <small role="status">Buscando pacientes…</small>}{patientSearchAttempted && !patientSearching && !patientError && patientResults.length === 0 && <small role="status">No se encontraron pacientes.</small>}<ul className="patient-search-results">{patientResults.map((result) => <li key={result.uuid}><button type="button" onClick={() => { patientSearchSequence.current += 1; setPatientSearching(false); setPatient(result); set("patientUuid", result.uuid); setPatientResults([]); }}>{patientLabel(result)} <span>{result.identifier ?? "Sin identificador"}</span></button></li>)}</ul></>}</section>
      <div className="form-grid">
        <div className="field"><label htmlFor="appointment-service">Servicio *</label><select id="appointment-service" required value={form.serviceUuid} disabled={Boolean(appointmentUuid && !config.data.isServiceOnAppointmentEditable)} onChange={(event) => { set("serviceUuid", event.target.value); set("serviceTypeUuid", ""); }}><option value="">Seleccionar</option>{services.data?.map((service) => <option key={service.uuid} value={service.uuid}>{service.speciality ? `${displayName(service.speciality)} · ` : ""}{displayName(service)}</option>)}</select></div>
        {config.data.enableServiceTypes && <div className="field"><label htmlFor="appointment-service-type">Tipo de servicio</label><select id="appointment-service-type" value={form.serviceTypeUuid} onChange={(event) => set("serviceTypeUuid", event.target.value)}><option value="">Sin tipo</option>{selectedService?.serviceTypes.map((type) => <option key={type.uuid} value={type.uuid}>{displayName(type)}</option>)}</select></div>}
        <div className="field"><label htmlFor="appointment-providers">Proveedor(es)</label><select id="appointment-providers" multiple size={Math.min(5, config.data.maxAppointmentProviders + 1)} value={form.providerUuids} onChange={(event) => set("providerUuids", [...event.target.selectedOptions].map((option) => option.value).slice(0, config.data.maxAppointmentProviders))}>{visibleProviders.map((entry) => <option key={entry.uuid} value={entry.uuid}>{displayName(entry)}</option>)}</select><small>{canManage ? `Máximo ${config.data.maxAppointmentProviders}` : "Sólo puedes gestionar tus propias citas"}</small></div>
        <div className="field"><label htmlFor="appointment-location">Ubicación</label><select id="appointment-location" value={form.locationUuid} onChange={(event) => set("locationUuid", event.target.value)}><option value="">Sin ubicación</option>{locations.data?.map((entry) => <option key={entry.uuid} value={entry.uuid}>{displayName(entry)}</option>)}</select></div>
        <div className="field"><label htmlFor="appointment-date">Fecha *</label><input id="appointment-date" type="date" required value={form.date} onChange={(event) => set("date", event.target.value)} /></div>
        <div className="field"><label htmlFor="appointment-start">Inicio *</label><input id="appointment-start" type="time" required value={form.startTime} onChange={(event) => set("startTime", event.target.value)} /></div>
        <div className="field"><label htmlFor="appointment-end">Término *</label><input id="appointment-end" type="time" required value={form.endTime} onChange={(event) => set("endTime", event.target.value)} /></div>
        {config.data.enableAppointmentStatusOption && <div className="field"><label htmlFor="appointment-status">Estado</label><select id="appointment-status" value={form.status} onChange={(event) => set("status", event.target.value as AppointmentStatus)}>{(["Requested", "Scheduled", "WaitList"] as AppointmentStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>}
        <div className="field"><label htmlFor="appointment-kind">Modalidad</label><select id="appointment-kind" value={form.appointmentKind} onChange={(event) => { const kind = event.target.value; set("appointmentKind", kind); set("teleconsultation", kind === "Virtual"); }}><option value="Scheduled">Programada</option><option value="WalkIn">Espontánea</option>{config.data.allowVirtualConsultation && <option value="Virtual">Teleconsulta</option>}</select></div>
      </div>
      {!appointmentUuid && <section className="appointment-recurrence"><label className="checkbox-field"><Checkbox inputId="appointment-recurring" checked={form.recurring} onChange={(event) => set("recurring", Boolean(event.checked))} /><span>Repetir cita</span></label>{form.recurring && <><div className="field"><label htmlFor="appointment-occurrences">Número de ocurrencias</label><InputNumber inputId="appointment-occurrences" min={2} max={100} value={form.occurrences} onValueChange={(event) => set("occurrences", event.value ?? config.data.recurrence.defaultNumberOfOccurrences)} /></div><fieldset><legend>Días</legend>{recurrenceDays.map(([value, label]) => <label key={value} className="checkbox-field"><Checkbox checked={form.repeatOn.includes(value)} onChange={(event) => set("repeatOn", event.checked ? [...form.repeatOn, value] : form.repeatOn.filter((day) => day !== value))} /><span>{label}</span></label>)}</fieldset></>}</section>}
      <div className="field appointment-comments"><label htmlFor="appointment-comments">Comentarios</label><InputTextarea id="appointment-comments" rows={3} value={form.comments} onChange={(event) => set("comments", event.target.value)} /></div>
      {conflicts.length > 0 && <section role="alert" className="appointment-conflicts"><strong>{appointmentText.conflict}</strong><ul>{conflicts.map((conflict, index) => <li key={conflict.uuid ?? index}>{conflict.message ?? (conflict.appointment ? `${patientLabel(conflict.appointment.patient)} · ${dateTimeOf(conflict.appointment.startDateTime).toFormat("dd/MM/yyyy HH:mm")}` : "Conflicto de horario")}</li>)}</ul></section>}
      {formError && <p role="alert" className="error-banner">{formError}</p>}
      <footer className="actions"><Button type="button" outlined label="Cancelar" onClick={cancel} /><Button type="submit" icon="pi pi-save" label="Guardar" loading={mutation.isPending} /></footer>
    </form>}
  </>;
  if (embedded) return <section className="appointment-form-embedded">{content}</section>;
  return <AuthGuard><AppShell mainClassName="appointments-page">
    <header className="appointments-heading"><div><span className="clinical-eyebrow">HCSBA</span><h1>{appointmentUuid ? "Editar cita" : appointmentText.newAppointment}</h1></div></header>
    <AppointmentNavigation active="calendar" />
    {content}
  </AppShell></AuthGuard>;
}
