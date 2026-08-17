import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { filterClinicalPatients, parseClinicalPatientSearchTabs } from "@/features/clinical/patientSearch";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getClinicalQueuePatients, searchAllClinicalPatients } from "@/services/bahmni/clinical";
import { loadExtensionFile } from "@/services/bahmni/config";
import type { PatientSearchResult } from "@/types/bahmni";

export function legacyProgramPatientUrl(patientUuid: string): string {
  return `/bahmni/clinical/programs/patient/${encodeURIComponent(patientUuid)}`;
}

function patientName(patient: PatientSearchResult): string {
  return String(patient.name ?? ([patient.givenName, patient.middleName, patient.familyName].filter(Boolean).join(" ") || patient.identifier || "Paciente"));
}

function ProgramPatientResults({ patients }: { patients: PatientSearchResult[] }) {
  if (patients.length === 0) return <div className="clinical-search-empty"><i className="pi pi-user-minus" aria-hidden="true" /><strong>Sin pacientes encontrados</strong><span>No hay pacientes que coincidan con este criterio.</span></div>;
  return <div className="clinical-patient-results">{patients.map((patient) => {
    const name = patientName(patient);
    return <a key={patient.uuid} href={legacyProgramPatientUrl(patient.uuid)}>
      <span className="clinical-result-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span>
      <span><strong>{name}</strong><small>{patient.identifier || "Sin identificador"}</small></span>
      <span className="clinical-result-context">Gestionar programas</span>
      <i className="pi pi-chevron-right" aria-hidden="true" />
    </a>;
  })}</div>;
}

export function ProgramSearch() {
  const router = useRouter();
  const { user, location, provider } = useAuth();
  const [filter, setFilter] = useState("");
  const query = typeof router.query.q === "string" ? router.query.q.trim() : "";
  const selectedId = typeof router.query.tab === "string" ? router.query.tab : "";
  const allowed = hasPrivilege(user, "app:clinical");
  const extensions = useQuery({ queryKey: ["extensions", "clinical", "programs"], queryFn: () => loadExtensionFile("clinical", "extension-programs.json"), enabled: allowed });
  const tabs = useMemo(() => parseClinicalPatientSearchTabs(extensions.data ?? [], user), [extensions.data, user]);
  const selectedTab = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const activePatients = useQuery({
    queryKey: ["program-search-active", selectedTab?.id, selectedTab?.handler, location?.uuid, provider?.uuid],
    queryFn: () => getClinicalQueuePatients({ handler: selectedTab?.handler ?? "", locationUuid: location?.uuid, providerUuid: provider?.uuid, additionalParams: selectedTab?.additionalParams, searchColumns: selectedTab?.searchColumns }),
    enabled: allowed && Boolean(selectedTab?.handler) && Boolean(location?.uuid),
  });
  const allPatients = useQuery({
    queryKey: ["program-search-all", query, location?.uuid],
    queryFn: () => searchAllClinicalPatients({ query, locationUuid: location?.uuid }),
    enabled: allowed && Boolean(selectedTab && !selectedTab.handler && query),
  });
  const visibleActivePatients = useMemo(() => filterClinicalPatients(activePatients.data ?? [], filter), [activePatients.data, filter]);
  const isActiveTab = Boolean(selectedTab?.handler);
  const patients = isActiveTab ? visibleActivePatients : allPatients.data;
  const loading = isActiveTab ? activePatients.isLoading : allPatients.isLoading;
  const failed = isActiveTab ? activePatients.isError : allPatients.isError;

  const switchTab = (tabId: string) => {
    setFilter("");
    void router.push({ pathname: "/clinical/programs", query: { tab: tabId } }, undefined, { shallow: true });
  };
  const submit = () => {
    const value = filter.trim();
    if (value && !isActiveTab) void router.push({ pathname: "/clinical/programs", query: { tab: selectedTab?.id, q: value } }, undefined, { shallow: true });
  };

  return <AuthGuard><AppShell title="Programas">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical requerido para Programas.</p>}
    {allowed && <section className="panel clinical-search-panel">
      <header className="clinical-search-header"><span className="clinical-search-icon"><i className="pi pi-book" aria-hidden="true" /></span><div><h2>Programas</h2><p>Busque y seleccione un paciente para gestionar sus enrolamientos.</p></div></header>
      {extensions.isLoading && <p role="status" className="p-4">Cargando opciones de Programas…</p>}
      {extensions.isError && <p role="alert" className="error-banner m-4">No fue posible cargar la configuración de Programas.</p>}
      {selectedTab && <>
        <nav className="clinical-search-tabs" role="tablist" aria-label="Búsqueda de pacientes para Programas">{tabs.map((tab) => {
          const count = tab.id === selectedTab.id && tab.handler ? activePatients.data?.length : undefined;
          return <button key={tab.id} type="button" role="tab" aria-selected={tab.id === selectedTab.id} className={tab.id === selectedTab.id ? "selected" : ""} onClick={() => switchTab(tab.id)}><span>{tab.label}</span>{tab.handler && <small aria-label={`${count ?? 0} pacientes`}>{activePatients.isLoading && tab.id === selectedTab.id ? "…" : count ?? 0}</small>}</button>;
        })}</nav>
        <form className="clinical-search-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <span className="p-input-icon-left"><i className="pi pi-search" /><InputText aria-label="Paciente por nombre o identificador" autoFocus value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre o identificador" /></span>
          {!isActiveTab && <Button type="submit" icon="pi pi-search" label="Buscar" disabled={!filter.trim()} />}
        </form>
        {isActiveTab && !location?.uuid && <p role="alert" className="warning-banner m-4">Seleccione una ubicación para cargar los pacientes activos.</p>}
        {loading && <p role="status" className="p-4">Cargando pacientes…</p>}
        {failed && <p role="alert" className="error-banner m-4">No fue posible cargar los pacientes.</p>}
        {patients && !loading && !failed && <ProgramPatientResults patients={patients} />}
        {!isActiveTab && !query && <div className="clinical-search-empty"><i className="pi pi-search" aria-hidden="true" /><strong>Buscar en todos los pacientes</strong><span>Ingrese un nombre o identificador para consultar el índice de OpenMRS.</span></div>}
      </>}
    </section>}
  </AppShell></AuthGuard>;
}
