import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { clinicalPatientDestination, filterClinicalPatients, parseClinicalPatientSearchTabs, type ClinicalPatientSearchTab } from "@/features/clinical/patientSearch";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { hasAssignedBedFlag } from "@/features/adt/adtRules";
import { BedIcon } from "@/features/ipd/BedIcon";
import { resolveLegacyRoute } from "@/config-compat/legacyRoutes";
import { hasPrivilege } from "@/services/bahmni/auth";
import { audit } from "@/services/bahmni/audit";
import { getClinicalQueuePatients, searchAllClinicalPatients } from "@/services/bahmni/clinical";
import { loadAppConfig, loadExtensions } from "@/services/bahmni/config";
import type { PatientSearchResult } from "@/types/bahmni";

function configRoot(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const nested = value?.config;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : value ?? {};
}

function allSearchFilter(config: Record<string, unknown> | undefined): { attrName?: string; attrValue?: string } | undefined {
  const configured = configRoot(config).filterOutAttributeForAllSearch;
  if (!Array.isArray(configured) || !configured[0] || typeof configured[0] !== "object") return undefined;
  const first = configured[0] as Record<string, unknown>;
  return {
    attrName: typeof first.attrName === "string" ? first.attrName : undefined,
    attrValue: typeof first.attrValue === "string" ? first.attrValue : undefined,
  };
}

function PatientResults({ tab, patients }: { tab: ClinicalPatientSearchTab; patients: PatientSearchResult[] }) {
  if (patients.length === 0) return <div className="clinical-search-empty"><i className="pi pi-user-minus" aria-hidden="true" /><strong>Sin pacientes encontrados</strong><span>No hay pacientes que coincidan con este criterio.</span></div>;
  return <div className="clinical-patient-results">{patients.map((patient) => {
    const name = String(patient.name ?? ([patient.givenName, patient.middleName, patient.familyName].filter(Boolean).join(" ") || patient.identifier || "Paciente"));
    return <Link key={patient.uuid} href={clinicalPatientDestination(tab, patient)}>
      <span className="clinical-result-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span>
      <span><strong>{name}</strong><small>{patient.identifier || "Sin identificador"}</small></span>
      <span className="clinical-result-badges"><span className="clinical-result-context">{patient.activeVisitUuid ? "Visita activa" : "Sin visita activa"}</span>{hasAssignedBedFlag(patient) && <span className="clinical-bed-badge" title="Paciente con cama asignada" aria-label="Paciente con cama asignada"><BedIcon /></span>}</span>
      <i className="pi pi-chevron-right" aria-hidden="true" />
    </Link>;
  })}</div>;
}

export default function ClinicalSearchPage() {
  useClinicalTranslations();
  const { t } = useTranslation();
  const router = useRouter();
  const { user, location, provider } = useAuth();
  const [filter, setFilter] = useState("");
  const routeQuery = typeof router.query.q === "string" ? router.query.q : "";
  const selectedId = typeof router.query.tab === "string" ? router.query.tab : "";
  const allowed = hasPrivilege(user, "app:clinical");

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined" || !window.location.hash) return;
    const destination = resolveLegacyRoute("/bahmni/clinical/index.html", window.location.hash);
    if (destination !== "/clinical") void router.replace(destination);
  }, [router]);

  useEffect(() => { void audit("VIEWED_CLINICAL_PATIENT_SEARCH", "", undefined, "MODULE_LABEL_CLINICAL_KEY"); }, []);

  const extensions = useQuery({ queryKey: ["extensions", "clinical"], queryFn: () => loadExtensions("clinical"), enabled: allowed });
  const appConfig = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical"), enabled: allowed });
  const tabs = useMemo(() => parseClinicalPatientSearchTabs(extensions.data ?? [], user), [extensions.data, user]);
  const selectedTab = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const handlerTabs = useMemo(() => tabs.filter((tab): tab is ClinicalPatientSearchTab & { handler: string } => Boolean(tab.handler)), [tabs]);
  const queueQueries = useQueries({ queries: handlerTabs.map((tab) => ({
    queryKey: ["clinical-patient-queue", tab.id, tab.handler, location?.uuid, provider?.uuid, tab.additionalParams, tab.searchColumns.join("|")],
    queryFn: () => getClinicalQueuePatients({ handler: tab.handler, locationUuid: location?.uuid, providerUuid: provider?.uuid, additionalParams: tab.additionalParams, searchColumns: tab.searchColumns }),
    enabled: allowed && Boolean(location?.uuid),
    refetchInterval: false as const,
  })) });
  const queues = useMemo(() => new Map(handlerTabs.map((tab, index) => [tab.id, queueQueries[index]])), [handlerTabs, queueQueries]);
  const selectedQueue = selectedTab?.handler ? queues.get(selectedTab.id) : undefined;
  const visibleQueue = useMemo(() => filterClinicalPatients(selectedQueue?.data ?? [], filter), [selectedQueue?.data, filter]);
  const allPatients = useQuery({
    queryKey: ["clinical-all-patients", routeQuery, location?.uuid, allSearchFilter(appConfig.data)],
    queryFn: () => searchAllClinicalPatients({ query: routeQuery, locationUuid: location?.uuid, filterOutAttribute: allSearchFilter(appConfig.data) }),
    enabled: allowed && Boolean(selectedTab && !selectedTab.handler && selectedTab.view !== "custom" && routeQuery.trim()),
  });

  useEffect(() => {
    if (!selectedTab || selectedTab.handler || selectedTab.view === "custom" || allPatients.data?.length !== 1) return;
    const patient = allPatients.data[0];
    if (patient) void router.push(clinicalPatientDestination(selectedTab, patient));
  }, [allPatients.data, router, selectedTab]);

  const switchTab = (tab: ClinicalPatientSearchTab) => {
    setFilter("");
    void router.push({ pathname: "/clinical", query: { tab: tab.id } }, undefined, { shallow: true });
  };

  const submit = () => {
    if (!selectedTab) return;
    if (selectedTab.handler) {
      const patient = visibleQueue.length === 1 ? visibleQueue[0] : undefined;
      if (patient) void router.push(clinicalPatientDestination(selectedTab, patient));
      return;
    }
    const query = filter.trim();
    if (query) void router.push({ pathname: "/clinical", query: { tab: selectedTab.id, q: query } }, undefined, { shallow: true });
  };

  return <AuthGuard><AppShell title="Clínico">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical requerido por el módulo legacy.</p>}
    {allowed && <section className="panel clinical-search-panel">
      <header className="clinical-search-header"><span className="clinical-search-icon"><i className="pi pi-heart" aria-hidden="true" /></span><div><h2>Consulta clínica</h2><p>Busque y seleccione un paciente para continuar.</p></div></header>
      {(extensions.isLoading || appConfig.isLoading) && <p role="status">Cargando colas clínicas…</p>}
      {(extensions.isError || appConfig.isError) && <p role="alert" className="error-banner">No fue posible cargar la configuración de búsqueda clínica.</p>}
      {selectedTab && <>
        <nav className="clinical-search-tabs" role="tablist" aria-label="Tipos de búsqueda clínica">{tabs.map((tab) => {
          const queue = tab.handler ? queues.get(tab.id) : undefined;
          const count = tab.id === selectedTab?.id && tab.handler && filter ? visibleQueue.length : queue?.data?.length;
          return <button key={tab.id} type="button" role="tab" aria-selected={tab.id === selectedTab?.id} className={tab.id === selectedTab?.id ? "selected" : ""} onClick={() => switchTab(tab)}>
            <span>{String(t(tab.translationKey ?? "", { defaultValue: tab.label }))}</span>
            {tab.handler && <small aria-label={`${count ?? 0} pacientes`}>{queue?.isLoading ? "…" : count ?? 0}</small>}
          </button>;
        })}</nav>
        {selectedTab?.view === "custom" ? <div className="warning-banner clinical-custom-queue"><strong>{String(t(selectedTab.translationKey ?? "", { defaultValue: selectedTab.label }))}</strong><p>Esta cola usa el adaptador de notificaciones del frontend anterior. Está identificada y será portada como componente React; no se ejecutará su template Angular.</p></div> : <>
          <form className="clinical-search-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <span className="p-input-icon-left"><i className="pi pi-search" /><InputText id="clinical-search" aria-label="Paciente por nombre o identificador" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre o identificador" /></span>
            {!selectedTab?.handler && <Button type="submit" icon="pi pi-search" label="Buscar" disabled={!filter.trim()} />}
          </form>
          {selectedTab?.handler && selectedQueue?.isLoading && <p role="status">Cargando pacientes de la cola…</p>}
          {selectedTab?.handler && selectedQueue?.isError && <p role="alert" className="error-banner">No fue posible cargar esta cola clínica.</p>}
          {selectedTab?.handler && selectedQueue?.data && <PatientResults tab={selectedTab} patients={visibleQueue} />}
          {!selectedTab?.handler && routeQuery && allPatients.isLoading && <p role="status">Buscando pacientes…</p>}
          {!selectedTab?.handler && allPatients.isError && <p role="alert" className="error-banner">No fue posible buscar pacientes.</p>}
          {!selectedTab.handler && allPatients.data && <PatientResults tab={selectedTab} patients={allPatients.data} />}
          {!selectedTab?.handler && !routeQuery && <div className="clinical-search-empty"><i className="pi pi-search" aria-hidden="true" /><strong>Buscar en todos los pacientes</strong><span>Ingrese un nombre o identificador para consultar el índice de OpenMRS.</span></div>}
        </>}
      </>}
    </section>}
  </AppShell></AuthGuard>;
}
