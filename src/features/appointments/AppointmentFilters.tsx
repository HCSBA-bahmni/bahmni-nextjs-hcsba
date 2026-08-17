import { MultiSelect } from "primereact/multiselect";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import type { AppointmentLocation, AppointmentProvider, AppointmentService, AppointmentStatus } from "./types";
import { displayName, statusLabel } from "./domain";

export interface AppointmentFilterState {
  patient: string;
  services: string[];
  providers: string[];
  locations: string[];
  statuses: AppointmentStatus[];
}

export const emptyAppointmentFilters: AppointmentFilterState = { patient: "", services: [], providers: [], locations: [], statuses: [] };

export function AppointmentFilters({ value, onChange, services, providers, locations, hideStatuses = false }: {
  value: AppointmentFilterState;
  onChange(value: AppointmentFilterState): void;
  services: AppointmentService[];
  providers: AppointmentProvider[];
  locations: AppointmentLocation[];
  hideStatuses?: boolean;
}) {
  const serviceOptions = services.map((service) => ({ label: service.speciality ? `${displayName(service.speciality)} · ${displayName(service)}` : displayName(service), value: service.uuid }));
  return <section className="appointments-filters panel" aria-label="Filtros de citas">
    <div className="field"><label htmlFor="appointment-patient-filter">Paciente</label><InputText id="appointment-patient-filter" value={value.patient} placeholder="Nombre o identificador" onChange={(event) => onChange({ ...value, patient: event.target.value })} /></div>
    <div className="field"><label htmlFor="appointment-service-filter">Especialidad / servicio</label><MultiSelect inputId="appointment-service-filter" value={value.services} options={serviceOptions} filter display="chip" onChange={(event) => onChange({ ...value, services: event.value ?? [] })} /></div>
    <div className="field"><label htmlFor="appointment-provider-filter">Proveedor</label><MultiSelect inputId="appointment-provider-filter" value={value.providers} options={providers.map((provider) => ({ label: displayName(provider), value: provider.uuid }))} filter display="chip" onChange={(event) => onChange({ ...value, providers: event.value ?? [] })} /></div>
    <div className="field"><label htmlFor="appointment-location-filter">Ubicación</label><MultiSelect inputId="appointment-location-filter" value={value.locations} options={locations.map((location) => ({ label: displayName(location), value: location.uuid }))} filter display="chip" onChange={(event) => onChange({ ...value, locations: event.value ?? [] })} /></div>
    {!hideStatuses && <div className="field"><label htmlFor="appointment-status-filter">Estado</label><MultiSelect inputId="appointment-status-filter" value={value.statuses} options={(["Requested", "Scheduled", "CheckedIn", "Completed", "Cancelled", "Missed", "WaitList"] as AppointmentStatus[]).map((status) => ({ label: statusLabel(status), value: status }))} display="chip" onChange={(event) => onChange({ ...value, statuses: event.value ?? [] })} /></div>}
    <Button type="button" text icon="pi pi-filter-slash" label="Restablecer" onClick={() => onChange(emptyAppointmentFilters)} />
  </section>;
}
