import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { parseIpdConfig, parseIpdQueues } from "@/config-compat/ipdConfig";
import { filterClinicalPatients } from "@/features/clinical/patientSearch";
import { AssignedBedBadge } from "@/features/ipd/AssignedBedBadge";
import { IpdModuleNavigation } from "@/features/ipd/IpdModuleNavigation";
import { useIpdTranslations } from "@/features/ipd/useIpdTranslations";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getClinicalQueuePatients, searchAllClinicalPatients } from "@/services/bahmni/clinical";
import { loadAppConfig, loadExtensions } from "@/services/bahmni/config";
import type { PatientSearchResult } from "@/types/bahmni";

function PatientRows({ patients }: { patients: PatientSearchResult[] }) {
  if (patients.length === 0) {
    return <div className="clinical-search-empty"><i className="pi pi-user-minus" aria-hidden="true" /><strong>Sin pacientes encontrados</strong><span>No hay pacientes que coincidan con este criterio.</span></div>;
  }

  return <div className="clinical-patient-results">{patients.map((patient) => {
    const name = String(patient.name ?? ([patient.givenName, patient.middleName, patient.familyName].filter(Boolean).join(" ") || patient.identifier || "Paciente"));
    return <Link key={patient.uuid} href={`/bedmanagement/patient/${encodeURIComponent(patient.uuid)}`}>
      <span className="clinical-result-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span>
      <span><strong>{name}</strong><small>{patient.identifier || "Sin identificador"}</small></span>
      <span className="clinical-result-badges">
        <span className="clinical-result-context">{patient.activeVisitUuid ? "Visita activa" : "Sin visita activa"}</span>
        <AssignedBedBadge patientUuid={patient.uuid} />
      </span>
      <i className="pi pi-chevron-right" aria-hidden="true" />
    </Link>;
  })}</div>;
}

export function IpdHome() {
  useIpdTranslations();
  const { t } = useTranslation();
  const { user, location, provider } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const allowed = hasPrivilege(user, "app:adt");
  const config = useQuery({ queryKey: ["app-config", "ipd"], queryFn: async () => parseIpdConfig(await loadAppConfig("ipd")), enabled: allowed });
  const extensions = useQuery({ queryKey: ["extensions", "ipd"], queryFn: () => loadExtensions("ipd"), enabled: allowed });
  const queues = useMemo(() => parseIpdQueues(extensions.data ?? [], user), [extensions.data, user]);
  const selected = queues.find((queue) => queue.id === selectedId) ?? queues[0];
  const configured = useMemo(() => queues.filter((queue) => queue.handler), [queues]);
  const queueQueries = useQueries({ queries: configured.map((queue) => ({
    queryKey: ["ipd", "queue", queue.id, location?.uuid, provider?.uuid, queue.additionalParams, queue.searchColumns.join("|")],
    queryFn: () => getClinicalQueuePatients({ handler: queue.handler!, locationUuid: location?.uuid, providerUuid: provider?.uuid, additionalParams: queue.additionalParams, searchColumns: queue.searchColumns }),
    enabled: allowed && Boolean(location?.uuid),
  })) });
  const queryMap = useMemo(() => new Map(configured.map((queue, index) => [queue.id, queueQueries[index]])), [configured, queueQueries]);
  const allPatients = useQuery({
    queryKey: ["ipd", "all-patients", search, location?.uuid],
    queryFn: () => searchAllClinicalPatients({ query: search, locationUuid: location?.uuid }),
    enabled: Boolean(allowed && selected && !selected.handler && search.trim()),
  });
  const selectedQuery = selected?.handler ? queryMap.get(selected.id) : allPatients;
  const patients = useMemo(
    () => selected?.handler ? filterClinicalPatients(selectedQuery?.data ?? [], search) : selectedQuery?.data ?? [],
    [search, selected?.handler, selectedQuery?.data],
  );

  return <AuthGuard><AppShell>
    {!allowed && <p className="error-banner" role="alert">No tiene el privilegio app:adt requerido por Gestión de Camas.</p>}
    {allowed && <>
      <IpdModuleNavigation activeMode="patients" />
      {config.isError && <p className="error-banner" role="alert">No fue posible cargar ipd/app.json.</p>}
      <section className="panel clinical-search-panel ipd-patient-selector">
        <header className="clinical-search-header ipd-selector-header">
          <div className="ipd-selector-heading"><span className="clinical-search-icon"><i className="pi pi-building" aria-hidden="true" /></span><div><h2>Hospitalización</h2><p>Busque y seleccione un paciente para gestionar su hospitalización.</p></div></div>
          <div className="ipd-selector-actions"><Link href="/bedmanagement/care-view"><Button outlined icon="pi pi-heart" label="Care View" /></Link></div>
        </header>
        <nav className="clinical-search-tabs" role="tablist" aria-label="Colas IPD">{queues.map((queue) => {
          const query = queue.handler ? queryMap.get(queue.id) : undefined;
          const count = selected?.id === queue.id && queue.handler && search ? patients.length : query?.data?.length;
          return <button type="button" role="tab" aria-selected={selected?.id === queue.id} className={selected?.id === queue.id ? "selected" : ""} key={queue.id} onClick={() => { setSelectedId(queue.id); setSearch(""); }}>
            <span>{String(t(queue.translationKey ?? "", { defaultValue: queue.label }))}</span>{queue.handler && <small aria-label={`${count ?? 0} pacientes`}>{query?.isLoading ? "…" : count ?? 0}</small>}
          </button>;
        })}</nav>
        {selected && <form className="clinical-search-form" onSubmit={(event) => event.preventDefault()}><span className="p-input-icon-left"><i className="pi pi-search" /><InputText value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o identificador" aria-label="Buscar paciente" /></span></form>}
        {selectedQuery?.isLoading && <p role="status">Cargando pacientes…</p>}
        {selectedQuery?.isError && <p className="error-banner" role="alert">No fue posible cargar esta cola configurada.</p>}
        {selectedQuery?.data && <PatientRows patients={patients} />}
        {selected && !selected.handler && !search && <div className="clinical-search-empty"><i className="pi pi-search" aria-hidden="true" /><strong>Buscar en todos los pacientes</strong><span>Ingrese un nombre o identificador para consultar el índice de OpenMRS.</span></div>}
      </section>
    </>}
  </AppShell></AuthGuard>;
}
