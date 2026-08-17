import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { InputText } from "primereact/inputtext";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { filterClinicalPatients } from "@/features/clinical/patientSearch";
import { ordersPatientDestination, parseOrdersPatientSearchTabs } from "@/features/orders/patientSearch";
import { AssignedBedBadge } from "@/features/ipd/AssignedBedBadge";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getClinicalQueuePatients } from "@/services/bahmni/clinical";
import { loadExtensions } from "@/services/bahmni/config";

export default function OrdersSearchPage() {
  const { user, location, provider } = useAuth();
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const allowed = hasPrivilege(user, "app:orders");
  const extensions = useQuery({ queryKey: ["extensions", "orders"], queryFn: () => loadExtensions("orders"), enabled: allowed });
  const tabs = useMemo(() => parseOrdersPatientSearchTabs(extensions.data ?? [], user), [extensions.data, user]);
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const queues = useQueries({ queries: tabs.map((tab) => ({
    queryKey: ["orders-patient-queue", tab.id, tab.handler, location?.uuid, provider?.uuid, tab.additionalParams, tab.searchColumns.join("|")],
    queryFn: () => getClinicalQueuePatients({ handler: tab.handler, locationUuid: location?.uuid, providerUuid: provider?.uuid, additionalParams: tab.additionalParams, searchColumns: tab.searchColumns }),
    enabled: allowed && Boolean(location?.uuid),
    refetchInterval: false as const,
  })) });
  const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.id === selected?.id));
  const selectedQueue = queues[selectedIndex];
  const patients = useMemo(() => filterClinicalPatients(selectedQueue?.data ?? [], filter), [selectedQueue?.data, filter]);

  return <AuthGuard><AppShell title="Órdenes">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:orders requerido por el módulo legacy.</p>}
    {allowed && <section className="panel clinical-search-panel">
      <header className="clinical-search-header"><span className="clinical-search-icon"><i className="pi pi-list" aria-hidden="true" /></span><div><h2>Órdenes</h2><p>Busque y seleccione un paciente para cumplir sus órdenes.</p></div></header>
      {extensions.isLoading && <p role="status">Cargando configuración de Órdenes…</p>}
      {extensions.isError && <p role="alert" className="error-banner">No fue posible cargar orders/extension.json.</p>}
      {selected && <>
        <nav className="clinical-search-tabs" role="tablist" aria-label="Tipos de órdenes">{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === selected.id} className={tab.id === selected.id ? "selected" : ""} onClick={() => { setSelectedId(tab.id); setFilter(""); }}><span>{String(t(tab.translationKey ?? "", { defaultValue: tab.label }))}</span><small>{queues[index]?.isLoading ? "…" : queues[index]?.data?.length ?? 0}</small></button>)}</nav>
        <form className="clinical-search-form" onSubmit={(event) => event.preventDefault()}><span className="p-input-icon-left"><i className="pi pi-search" /><InputText aria-label="Paciente por nombre o identificador" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre o identificador" /></span></form>
        {selectedQueue?.isLoading && <p role="status">Cargando pacientes…</p>}
        {selectedQueue?.isError && <p role="alert" className="error-banner">No fue posible cargar los pacientes configurados para Órdenes.</p>}
        {selectedQueue?.data && patients.length === 0 && <div className="clinical-search-empty"><i className="pi pi-user-minus" aria-hidden="true" /><strong>Sin pacientes encontrados</strong><span>No hay pacientes que coincidan con este criterio.</span></div>}
        {selectedQueue?.data && patients.length > 0 && <div className="clinical-patient-results">{patients.map((patient) => {
          const name = String(patient.name ?? [patient.givenName, patient.middleName, patient.familyName].filter(Boolean).join(" ") ?? patient.identifier);
          return <Link key={patient.uuid} href={ordersPatientDestination(selected, patient)}><span className="clinical-result-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span><span><strong>{name}</strong><small>{patient.identifier || "Sin identificador"}</small></span><span className="clinical-result-badges"><span className="clinical-result-context">{patient.activeVisitUuid ? "Visita activa" : "Sin visita activa"}</span><AssignedBedBadge patientUuid={String(patient.uuid ?? "")} /></span><i className="pi pi-chevron-right" aria-hidden="true" /></Link>;
        })}</div>}
      </>}
    </section>}
  </AppShell></AuthGuard>;
}
