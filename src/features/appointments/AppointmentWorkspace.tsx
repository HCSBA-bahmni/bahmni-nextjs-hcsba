import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/router";
import { DateTime } from "luxon";
import { Button } from "primereact/button";
import { Calendar as DatePicker } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { Sidebar } from "primereact/sidebar";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Calendar, dateFnsLocalizer, type SlotInfo, Views } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getAppointmentSummary, getAppointmentsForDate, loadAppointmentLocations, loadAppointmentProviders, loadAppointmentServices, searchAppointments, searchAppointmentsByFilters } from "@/services/bahmni/appointments";
import { loadAppointmentConfig, minutesFromClock } from "./config";
import { APPOINTMENTS_TIME_ZONE, calendarEvents, canManageAppointments, canManageOwnAppointments, dateTimeOf, displayName, patientName, providerNames, statusLabel, type AppointmentCalendarEvent } from "./domain";
import { AppointmentActions } from "./AppointmentActions";
import { AppointmentForm } from "./AppointmentForm";
import { AppointmentFilters, emptyAppointmentFilters, type AppointmentFilterState } from "./AppointmentFilters";
import { AppointmentNavigation, type AppointmentSection } from "./AppointmentNavigation";
import { appointmentText } from "./translations";
import { detailedSummaryRows, serviceSummaryRows, type AppointmentSummaryRow, type DetailedSummaryGroup } from "./summary";
import type { Appointment, AppointmentStatus, AppointmentSummary } from "./types";

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }), getDay, locales: { es } });

function startAndEnd(date: Date, section: AppointmentSection, calendarView: "day" | "week") {
  const selected = DateTime.fromJSDate(date, { zone: APPOINTMENTS_TIME_ZONE });
  if (section === "calendar" && calendarView === "week" || section === "summary") return { start: selected.startOf("week"), end: selected.endOf("week") };
  if (section === "calendar" || section === "list") return { start: selected.startOf("day"), end: selected.endOf("day") };
  return { start: selected.startOf("week"), end: selected.endOf("week") };
}

function csvQuery(value: string | string[] | undefined): string[] {
  const text = Array.isArray(value) ? value.join(",") : value;
  return text?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function initialAppointmentFilters(section: AppointmentSection, query: Record<string, string | string[] | undefined>): AppointmentFilterState {
  return {
    ...emptyAppointmentFilters,
    services: csvQuery(query.services), providers: csvQuery(query.providers), locations: csvQuery(query.locations),
    statuses: section === "waitlist" ? ["WaitList"] : csvQuery(query.statuses) as AppointmentStatus[],
  };
}

function includesPatient(appointment: Appointment, query: string): boolean {
  const value = `${patientName(appointment)} ${appointment.patient.identifier ?? ""}`.toLocaleLowerCase("es");
  return value.includes(query.trim().toLocaleLowerCase("es"));
}

type SummaryGroup = DetailedSummaryGroup | "service";

function SummaryTable({ title, rows, weekStart, emptyMessage, onOpen }: { title: string; rows: AppointmentSummaryRow[]; weekStart: DateTime; emptyMessage: string; onOpen: (date: string, uuid: string | undefined, group: SummaryGroup) => void }) {
  const group: SummaryGroup = title === "Especialidades" ? "speciality" : title === "Proveedores" ? "provider" : title === "Ubicaciones" ? "location" : "service";
  const dates = Array.from({ length: 7 }, (_, index) => weekStart.plus({ days: index }));
  const totals = dates.map((date) => rows.reduce((total, row) => {
    const cell = row.rowDataList.find((item) => item.date === date.toISODate());
    return { count: total.count + (cell?.count ?? 0), missed: total.missed + (cell?.missedCount ?? 0) };
  }, { count: 0, missed: 0 }));
  return <section className="appointment-summary-section" aria-labelledby={`summary-${group}`}>
    <h2 id={`summary-${group}`}>{title}</h2>
    {!rows.length ? <p className="appointment-summary-empty">{emptyMessage}</p> : <div className="appointment-summary-table-scroll"><table className="appointment-summary-table">
      <thead><tr><th scope="col">{title}</th>{dates.map((date) => <th key={date.toISODate()} scope="col" className={date.hasSame(DateTime.now().setZone(APPOINTMENTS_TIME_ZONE), "day") ? "current-date" : ""}>{date.setLocale("es").toFormat("d LLL, ccc")}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.rowLabel}><th scope="row">{row.rowLabel}</th>{dates.map((date) => { const cell = row.rowDataList.find((item) => item.date === date.toISODate()); return <td key={date.toISODate()} className={date.hasSame(DateTime.now().setZone(APPOINTMENTS_TIME_ZONE), "day") ? "current-date" : ""}>{cell ? <button type="button" onClick={() => onOpen(cell.date, cell.uuid, group)}><strong>{cell.count}</strong>{cell.missedCount > 0 && <span> ({cell.missedCount} ausente{cell.missedCount === 1 ? "" : "s"})</span>}</button> : null}</td>; })}</tr>)}
      <tr className="appointment-summary-total"><th scope="row">Total</th>{dates.map((date, index) => <td key={date.toISODate()} className={date.hasSame(DateTime.now().setZone(APPOINTMENTS_TIME_ZONE), "day") ? "current-date" : ""}>{totals[index]!.count > 0 && <button type="button" onClick={() => onOpen(date.toISODate()!, undefined, group)}><strong>{totals[index]!.count}</strong>{totals[index]!.missed > 0 && <span> ({totals[index]!.missed} ausente{totals[index]!.missed === 1 ? "" : "s"})</span>}</button>}</td>)}</tr>
      </tbody>
    </table></div>}
  </section>;
}

function SummaryView({ appointments, serverSummary, weekStart, detailed, onOpen }: { appointments: Appointment[]; serverSummary: AppointmentSummary[]; weekStart: DateTime; detailed: boolean; onOpen: (date: string, uuid: string | undefined, group: SummaryGroup) => void }) {
  const services = serviceSummaryRows(serverSummary).sort((a, b) => detailed ? a.rowLabel.localeCompare(b.rowLabel, "es") : 0);
  if (!detailed) return <SummaryTable title="Servicios" rows={services} weekStart={weekStart} emptyMessage="No hay citas para los servicios esta semana." onOpen={onOpen} />;
  return <div className="appointment-summary-detailed">
    <SummaryTable title="Especialidades" rows={detailedSummaryRows(appointments, "speciality")} weekStart={weekStart} emptyMessage="No hay citas por especialidad esta semana." onOpen={onOpen} />
    <SummaryTable title="Proveedores" rows={detailedSummaryRows(appointments, "provider")} weekStart={weekStart} emptyMessage="No hay citas por proveedor esta semana." onOpen={onOpen} />
    <SummaryTable title="Servicios" rows={services} weekStart={weekStart} emptyMessage="No hay citas por servicio esta semana." onOpen={onOpen} />
    <SummaryTable title="Ubicaciones" rows={detailedSummaryRows(appointments, "location")} weekStart={weekStart} emptyMessage="No hay citas por ubicación esta semana." onOpen={onOpen} />
  </div>;
}

function AppointmentTable({ appointments, config }: { appointments: Appointment[]; config: Awaited<ReturnType<typeof loadAppointmentConfig>> }) {
  return <DataTable value={appointments} dataKey="uuid" paginator rows={20} emptyMessage={appointmentText.empty} stripedRows removableSort className="appointment-table">
    <Column field="patient.identifier" header="Identificador" sortable body={(item: Appointment) => item.patient.identifier
      ? <Link className="appointment-patient-link" href={`/clinical/patient/${encodeURIComponent(item.patient.uuid)}/dashboard`} target="_blank" rel="noopener noreferrer" title={`Abrir ficha clínica de ${patientName(item)}`}>{item.patient.identifier}</Link>
      : <span aria-label="Sin identificador">—</span>} />
    <Column header="Paciente" sortable sortField="patient.display" body={(item: Appointment) => patientName(item)} />
    <Column header="Fecha" sortable sortField="startDateTime" body={(item: Appointment) => dateTimeOf(item.startDateTime).setLocale("es").toFormat("dd/MM/yyyy")} />
    <Column header="Horario" body={(item: Appointment) => `${dateTimeOf(item.startDateTime).toFormat("HH:mm")}–${dateTimeOf(item.endDateTime).toFormat("HH:mm")}`} />
    <Column header="Proveedor(es)" body={(item: Appointment) => providerNames(item)} />
    <Column header="Especialidad" body={(item: Appointment) => displayName(item.service.speciality)} />
    <Column header="Servicio" sortable sortField="service.name" body={(item: Appointment) => displayName(item.service)} />
    {config.enableServiceTypes && <Column header="Tipo" body={(item: Appointment) => displayName(item.serviceType)} />}
    <Column header="Ubicación" body={(item: Appointment) => displayName(item.location)} />
    <Column header="Estado" sortable sortField="status" body={(item: Appointment) => <span className={`appointment-status status-${item.status.toLocaleLowerCase()}`}>{statusLabel(item.status)}</span>} />
    <Column header="Modalidad" body={(item: Appointment) => item.appointmentKind === "Virtual" ? "Teleconsulta" : item.appointmentKind === "WalkIn" ? "Espontánea" : "Programada"} />
    {Object.entries(config.additionalInfoColumns).map(([key, label]) => <Column key={key} header={label || key} body={(item: Appointment) => String(item.additionalInfo[key] ?? item.additionalInfo[label] ?? "—")} />)}
    <Column header="Acciones" body={(item: Appointment) => <AppointmentActions appointment={item} config={config} compact />} />
  </DataTable>;
}

function CalendarEventContent({ event }: { event: AppointmentCalendarEvent }) {
  const hasBed = event.appointments.some((appointment) => Boolean(appointment.additionalInfo.BED_NUMBER_KEY));
  const teleconsultation = event.appointments.some((appointment) => appointment.teleconsultation || appointment.appointmentKind === "Virtual" || Boolean(appointment.teleconsultationLink));
  return <span className="appointment-calendar-event">
    <span className="appointment-calendar-event-title">{event.title}</span>
    <span className="appointment-calendar-event-icons" aria-hidden="true">
      {hasBed && <i className="pi pi-building" />}
      {teleconsultation && <i className="pi pi-video" />}
      {event.appointments.length > 1 && <i className="pi pi-users" />}
      {event.appointment.status === "CheckedIn" && <i className="pi pi-check-circle" />}
      {event.appointment.status === "Completed" && <i className="pi pi-check" />}
      {event.appointment.status === "Missed" && <i className="pi pi-ban" />}
    </span>
  </span>;
}

export function AppointmentWorkspace({ section }: { section: AppointmentSection }) {
  const router = useRouter();
  const { user } = useAuth();
  const initialDate = typeof router.query.date === "string" ? DateTime.fromISO(router.query.date, { zone: APPOINTMENTS_TIME_ZONE }) : null;
  const [date, setDate] = useState(initialDate?.isValid ? initialDate.toJSDate() : new Date());
  const [calendarView, setCalendarView] = useState<"day" | "week">("day");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<AppointmentFilterState>(() => initialAppointmentFilters(section, router.query));
  const [selected, setSelected] = useState<Appointment[]>([]);
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{ start: Date; end: Date; providerUuid?: string }>();
  const calendarContainer = useRef<HTMLElement>(null);
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((entry) => entry.name ?? entry.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const routePatientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : undefined;
  const allowed = hasPrivilege(user, "app:appointments");
  const canCreate = canManageAppointments(privilegeNames) || canManageOwnAppointments(privilegeNames);
  const range = startAndEnd(date, section, calendarView);
  const config = useQuery({ queryKey: ["appointments", "config"], queryFn: loadAppointmentConfig, enabled: allowed });
  const services = useQuery({ queryKey: ["appointments", "services"], queryFn: loadAppointmentServices, enabled: allowed });
  const providers = useQuery({ queryKey: ["appointments", "providers"], queryFn: loadAppointmentProviders, enabled: allowed });
  const locations = useQuery({ queryKey: ["appointments", "locations"], queryFn: loadAppointmentLocations, enabled: allowed });
  const appointments = useQuery({
    queryKey: ["appointments", "search", section, calendarView, range.start.toISODate(), range.end.toISODate(), routePatientUuid],
    queryFn: () => {
      if (section === "waitlist") return searchAppointmentsByFilters({ status: "WaitList", ...(routePatientUuid ? { patientUuids: [routePatientUuid] } : {}) });
      if (section === "list" && routePatientUuid) return searchAppointmentsByFilters({ patientUuids: [routePatientUuid] });
      if (section === "list" || section === "calendar" && calendarView === "day") return getAppointmentsForDate(range.start.toUTC().toISO()!);
      return searchAppointments({ startDate: range.start.toUTC().toISO()!, endDate: range.end.toUTC().toISO()!, ...(routePatientUuid ? { patientUuid: routePatientUuid } : {}) });
    }, enabled: allowed,
  });
  const summary = useQuery({ queryKey: ["appointments", "summary", range.start.toISODate(), range.end.toISODate()], queryFn: () => getAppointmentSummary(range.start.toUTC().toISO()!, range.end.toUTC().toISO()!), enabled: allowed && section === "summary" });
  const visible = useMemo(() => (appointments.data ?? []).filter((appointment) => {
    if (filters.patient && !includesPatient(appointment, filters.patient)) return false;
    if (filters.services.length && !filters.services.includes(appointment.service.uuid)) return false;
    const providerUuids = appointment.providers.length ? appointment.providers.map((item) => item.uuid) : appointment.provider ? [appointment.provider.uuid] : ["unassigned"];
    if (filters.providers.length && !filters.providers.some((uuid) => providerUuids.includes(uuid))) return false;
    if (filters.locations.length && (!appointment.location || !filters.locations.includes(appointment.location.uuid))) return false;
    if (section !== "waitlist" && filters.statuses.length && !filters.statuses.includes(appointment.status)) return false;
    return true;
  }), [appointments.data, filters, section]);
  const events = useMemo(() => calendarEvents(visible, config.data?.colorsForAppointmentService ?? []), [visible, config.data?.colorsForAppointmentService]);
  const providerOptions = useMemo(() => [...(providers.data ?? []), { uuid: "unassigned", display: "Sin proveedor" }], [providers.data]);
  const resourceIds = new Set(events.map((event) => event.resourceId));
  filters.providers.forEach((uuid) => resourceIds.add(uuid));
  if (!resourceIds.size || events.some((event) => event.resourceId === "unassigned")) resourceIds.add("unassigned");
  const resources = [...resourceIds].map((id) => ({ id, title: id === "unassigned" ? "Sin proveedor" : displayName(providerOptions.find((entry) => entry.uuid === id)) }));
  const calendarConfig = config.data;
  const loading = config.isLoading || appointments.isLoading || services.isLoading || providers.isLoading || locations.isLoading || section === "summary" && summary.isLoading;
  const failed = config.isError || appointments.isError || services.isError || providers.isError || locations.isError || section === "summary" && summary.isError;

  useLayoutEffect(() => {
    const container = calendarContainer.current;
    if (!container) return;
    const normalizeThirdPartyAria = () => {
      container.querySelectorAll(".rbc-row-content[role='row'],.rbc-allday-cell[role='rowgroup'],.rbc-header [role='columnheader']").forEach((element) => element.removeAttribute("role"));
      container.querySelectorAll(".rbc-header [aria-sort]").forEach((element) => element.removeAttribute("aria-sort"));
    };
    normalizeThirdPartyAria();
    const observer = new MutationObserver(normalizeThirdPartyAria);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-sort"] });
    return () => observer.disconnect();
  });

  const openNew = (slot?: SlotInfo) => {
    if (section === "calendar") {
      const start = slot
        ? DateTime.fromJSDate(slot.start, { zone: APPOINTMENTS_TIME_ZONE })
        : DateTime.fromJSDate(date, { zone: APPOINTMENTS_TIME_ZONE }).startOf("day").plus({ minutes: minutesFromClock(calendarConfig?.startOfDay ?? "09:00") });
      const end = slot
        ? DateTime.fromJSDate(slot.end, { zone: APPOINTMENTS_TIME_ZONE })
        : start.plus({ minutes: minutesFromClock(calendarConfig?.calendarSlotDuration ?? "00:30") });
      const providerUuid = slot && typeof slot.resourceId === "string" && slot.resourceId !== "unassigned" ? slot.resourceId : undefined;
      setNewAppointmentSlot({ start: start.toJSDate(), end: end.toJSDate(), ...(providerUuid ? { providerUuid } : {}) });
      setNewAppointmentOpen(true);
      return;
    }
    const query: Record<string, string> = { returnTo: router.asPath };
    if (slot) { query.start = slot.start.toISOString(); query.end = slot.end.toISOString(); if (typeof slot.resourceId === "string" && slot.resourceId !== "unassigned") query.provider = slot.resourceId; }
    void router.push({ pathname: "/appointments/new", query });
  };

  const openSummaryList = (summaryDate: string, uuid: string | undefined, group: SummaryGroup) => {
    const query: Record<string, string> = {
      date: summaryDate,
      statuses: "Requested,Scheduled,CheckedIn,Completed,Missed",
    };
    if (uuid && group === "service") query.services = uuid;
    if (uuid && group === "provider") query.providers = uuid;
    if (uuid && group === "location") query.locations = uuid;
    if (uuid && group === "speciality") query.services = (services.data ?? []).filter((service) => service.speciality?.uuid === uuid).map((service) => service.uuid).join(",");
    void router.push({ pathname: "/appointments/list", query });
  };

  const periodUnit = section === "summary" || section === "calendar" && calendarView === "week" ? "weeks" : "days";
  const movePeriod = (amount: number) => setDate(DateTime.fromJSDate(date).plus({ [periodUnit]: amount }).toJSDate());

  return <AuthGuard><AppShell mainClassName="appointments-page">
    <header className="appointments-heading"><div><span className="clinical-eyebrow">HCSBA</span><h1>{appointmentText.module}</h1></div></header>
    <AppointmentNavigation active={section} />
    {!allowed && <p role="alert" className="error-banner">No cuentas con el privilegio app:appointments.</p>}
    {allowed && <>
      <div className="appointments-operation-bar">
        {section !== "summary" && <Button outlined icon={filtersOpen ? "pi pi-angle-left" : "pi pi-filter"} label={filtersOpen ? "Ocultar filtros" : "Mostrar filtros"} onClick={() => setFiltersOpen((open) => !open)} />}
        <span className="appointments-operation-spacer" />
        {section === "calendar" && <Button outlined icon="pi pi-list" label="Lista" onClick={() => void router.push("/appointments/list")} />}
        {section === "list" && <Button outlined icon="pi pi-calendar" label="Calendario" onClick={() => void router.push("/appointments/calendar")} />}
        {(section === "list" || section === "waitlist") && <Button outlined icon="pi pi-print" label="Imprimir" onClick={() => window.print()} />}
        {canCreate && <Button icon="pi pi-plus" label={appointmentText.newAppointment} onClick={() => openNew()} />}
      </div>
      <div className={`appointments-content${filtersOpen && section !== "summary" ? " filters-open" : ""}`}>
        {section !== "summary" && filtersOpen && <aside className="appointments-filter-sidebar"><AppointmentFilters value={filters} onChange={setFilters} services={services.data ?? []} providers={providerOptions} locations={locations.data ?? []} hideStatuses={section === "waitlist"} /></aside>}
        <div className="appointments-content-main">
          <div className="appointments-date-toolbar">
            <Button outlined label="Hoy" onClick={() => setDate(new Date())} />
            {section === "calendar" && <><Button outlined={calendarView !== "week"} disabled={calendarView === "week"} label="Semana" onClick={() => setCalendarView("week")} /><Button outlined={calendarView !== "day"} disabled={calendarView === "day"} label="Día" onClick={() => setCalendarView("day")} /></>}
            <span className="appointments-date-center">
              <Button outlined icon="pi pi-chevron-left" aria-label="Periodo anterior" onClick={() => movePeriod(-1)} />
              <label htmlFor="appointments-date" className="sr-only">Fecha de la agenda</label>
              <DatePicker inputId="appointments-date" value={date} onChange={(event) => event.value instanceof Date && setDate(event.value)} dateFormat="dd/mm/yy" showIcon />
              <Button outlined icon="pi pi-chevron-right" aria-label="Periodo siguiente" onClick={() => movePeriod(1)} />
            </span>
          </div>
          {loading && <p role="status">{appointmentText.loading}</p>}
          {failed && <p role="alert" className="error-banner">{appointmentText.loadError}</p>}
          {!loading && !failed && calendarConfig && section === "summary" && <SummaryView appointments={visible} serverSummary={summary.data ?? []} weekStart={range.start} detailed={calendarConfig.enableDetailedSummaryView} onOpen={openSummaryList} />}
          {!loading && !failed && calendarConfig && section === "calendar" && <section ref={calendarContainer} className="appointment-calendar-panel" aria-label="Calendario de citas">
            {!visible.length && <p className="calendar-no-appointment">No hay citas para mostrar.</p>}
            <Calendar localizer={localizer} culture="es" date={date} onNavigate={setDate} view={calendarView === "day" ? Views.DAY : Views.WEEK} onView={(view) => setCalendarView(view === Views.DAY ? "day" : "week")} views={[Views.DAY, Views.WEEK]} toolbar={false} events={events} resources={calendarView === "day" ? resources : undefined} resourceIdAccessor="id" resourceTitleAccessor="title" startAccessor="start" endAccessor="end" step={minutesFromClock(calendarConfig.calendarSlotDuration)} timeslots={Math.max(1, minutesFromClock(calendarConfig.calendarSlotLabelInterval) / minutesFromClock(calendarConfig.calendarSlotDuration))} min={DateTime.fromFormat(calendarConfig.startOfDay, "HH:mm").toJSDate()} max={DateTime.fromFormat(calendarConfig.endOfDay, "HH:mm").toJSDate()} selectable={canCreate} onSelectSlot={openNew} onSelectEvent={(event) => setSelected(event.appointments)} eventPropGetter={(event) => ({ style: { backgroundColor: event.color }, className: `status-${event.appointment.status.toLocaleLowerCase()}` })} components={{ event: CalendarEventContent }} messages={{ day: "Día", week: "Semana", today: "Hoy", previous: "Anterior", next: "Siguiente", noEventsInRange: appointmentText.empty }} />
          </section>}
          {!loading && !failed && calendarConfig && (section === "list" || section === "waitlist") && <AppointmentTable appointments={visible} config={calendarConfig} />}
        </div>
      </div>
    </>}
    <Sidebar visible={newAppointmentOpen} position="right" modal={false} dismissable={false} blockScroll={false} className="appointment-create-sidebar" header={appointmentText.newAppointment} onHide={() => setNewAppointmentOpen(false)}>
      {newAppointmentOpen && <AppointmentForm embedded initialSlot={newAppointmentSlot} onCancel={() => setNewAppointmentOpen(false)} onSaved={() => { setNewAppointmentOpen(false); setNewAppointmentSlot(undefined); }} />}
    </Sidebar>
    <Dialog visible={selected.length > 0} header={selected.length > 1 ? `${selected.length} citas en el mismo horario` : "Detalle de cita"} onHide={() => setSelected([])} className="appointment-detail-dialog">{calendarConfig && selected.map((appointment) => <article key={appointment.uuid} className="appointment-group-detail"><dl className="appointment-details"><div><dt>Paciente</dt><dd>{patientName(appointment)}</dd></div><div><dt>Horario</dt><dd>{dateTimeOf(appointment.startDateTime).setLocale("es").toFormat("dd/MM/yyyy HH:mm")}–{dateTimeOf(appointment.endDateTime).toFormat("HH:mm")}</dd></div><div><dt>Servicio</dt><dd>{displayName(appointment.service)}</dd></div><div><dt>Proveedor</dt><dd>{providerNames(appointment)}</dd></div><div><dt>Ubicación</dt><dd>{displayName(appointment.location)}</dd></div><div><dt>Estado</dt><dd>{statusLabel(appointment.status)}</dd></div>{Boolean(appointment.additionalInfo.BED_NUMBER_KEY) && <div><dt>Cama</dt><dd>{String(appointment.additionalInfo.BED_NUMBER_KEY)}</dd></div>}<div><dt>Comentarios</dt><dd>{appointment.comments || "—"}</dd></div></dl><AppointmentActions appointment={appointment} config={calendarConfig} /></article>)}</Dialog>
  </AppShell></AuthGuard>;
}
