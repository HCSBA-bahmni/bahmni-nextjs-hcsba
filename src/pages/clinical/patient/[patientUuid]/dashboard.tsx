import { useIsFetching, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Menu } from "primereact/menu";
import { ProgressSpinner } from "primereact/progressspinner";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { parseClinicalDashboardConfig } from "@/config-compat/clinicalConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { ClinicalDashboardSectionCard } from "@/features/clinical/ClinicalDashboardSection";
import { ClinicalDashboardMasonryItem } from "@/features/clinical/ClinicalDashboardMasonryItem";
import { dashboardControlTypes } from "@/features/clinical/DashboardControlRegistry";
import { createDashboardLayout } from "@/features/clinical/dashboardLayout";
import { activeConsultationRoute, patientAdtUrl } from "@/features/clinical/navigationLinks";
import { getUnopenedDashboardTabs, getVisibleDashboardTabs } from "@/features/clinical/clinicalDashboardTabs";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { audit } from "@/services/bahmni/audit";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppFile } from "@/services/bahmni/config";
import { getVisitLocation } from "@/services/bahmni/metadata";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits, getVisitSummary } from "@/services/bahmni/visits";
import { getRuntimeConfig } from "@/services/runtimeConfig";

export default function ClinicalDashboardPage() {
  useClinicalTranslations();
  const { t } = useTranslation();
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const requestedVisitUuid = typeof router.query.visitUuid === "string" ? router.query.visitUuid : "";
  const requestedTab = typeof router.query.tab === "string" ? router.query.tab : "";
  const enrollmentUuid = typeof router.query.enrollment === "string" ? router.query.enrollment : undefined;
  const programUuid = typeof router.query.programUuid === "string" ? router.query.programUuid : undefined;
  const dateEnrolled = typeof router.query.dateEnrolled === "string" ? router.query.dateEnrolled : undefined;
  const dateCompleted = typeof router.query.dateCompleted === "string" ? router.query.dateCompleted : undefined;
  const pendingConsultation = router.query.pending === "consultation";
  const allowed = hasPrivilege(user, "app:clinical");
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const dashboard = useQuery({ queryKey: ["app-file", "clinical", "dashboard.json"], queryFn: () => loadAppFile("clinical", "dashboard.json"), enabled: allowed });
  const visits = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const visitLocation = useQuery({ queryKey: ["visit-location", location?.uuid], queryFn: () => getVisitLocation(location!.uuid), enabled: allowed && Boolean(location?.uuid) });
  const runtimeConfig = useQuery({ queryKey: ["runtime-config"], queryFn: getRuntimeConfig, enabled: allowed });
  const tabs = useMemo(() => dashboard.data ? parseClinicalDashboardConfig(dashboard.data) : [], [dashboard.data]);
  const currentTab = tabs.find((tab) => tab.id === requestedTab) ?? tabs.find((tab) => tab.displayByDefault) ?? tabs[0];
  const activeVisit = (visits.data ?? []).find((visit) => !visit.stopDatetime && visit.location?.uuid === visitLocation.data?.uuid);
  const selectedVisit = (visits.data ?? []).find((visit) => visit.uuid === requestedVisitUuid) ?? activeVisit;
  const visitSummary = useQuery({ queryKey: ["clinical-visit-summary", selectedVisit?.uuid], queryFn: () => getVisitSummary(selectedVisit!.uuid), enabled: allowed && Boolean(selectedVisit?.uuid) });
  const patient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const visibleSections = (currentTab?.sections ?? []).filter((section) => hasPrivilege(user, section.requiredPrivilege));
  const dashboardLayout = createDashboardLayout(visibleSections);
  const pendingTypes = [...new Set(visibleSections.filter((section) => !dashboardControlTypes.has(section.type)).map((section) => section.type))];
  const locale = user?.userProperties?.defaultLocale ?? "es";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago";
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const dashboardContext = patient ? ({ patient, visit: selectedVisit, visits: visits.data ?? [], visitSummary: visitSummary.data as Record<string, unknown> | undefined, enrollmentUuid, programUuid, dateEnrolled, dateCompleted, user, provider, location, locale, timeZone, privilegeNames, tabs }) : undefined;
  const loading = profile.isLoading || dashboard.isLoading || visits.isLoading || visitLocation.isLoading || visitSummary.isLoading;
  const consultationEnabled = runtimeConfig.data?.features.clinicalConsultationEnabled === true;
  const canAccessAdt = hasPrivilege(user, "app:adt");
  const dashboardScrollRef = useRef<HTMLDivElement>(null);
  const dashboardMenuRef = useRef<Menu>(null);
  const [openedTabIds, setOpenedTabIds] = useState<string[]>([]);
  const [readyScrollKey, setReadyScrollKey] = useState("");
  const sawDashboardFetchRef = useRef(false);
  const settledScrollKeyRef = useRef("");
  const dashboardFetching = useIsFetching({ predicate: (query) => {
    const domain = query.queryKey[0];
    return domain === "clinical-dashboard" || domain === "clinical" || domain === "encounter-config" || domain === "app-config" || domain === "runtime-config";
  } });
  const scrollKey = `${patientUuid}:${selectedVisit?.uuid ?? ""}:${enrollmentUuid ?? ""}:${currentTab?.id ?? ""}`;
  const dashboardReady = readyScrollKey === scrollKey;
  const visibleTabs = getVisibleDashboardTabs(tabs, openedTabIds, currentTab?.id);
  const unopenedTabs = getUnopenedDashboardTabs(tabs, openedTabIds, currentTab?.id);
  const navigateToTab = (tabId: string) => void router.push({ pathname: `/clinical/patient/${patientUuid}/dashboard`, query: { ...(selectedVisit?.uuid ? { visitUuid: selectedVisit.uuid } : {}), ...(enrollmentUuid ? { enrollment: enrollmentUuid } : {}), ...(programUuid ? { programUuid } : {}), ...(dateEnrolled ? { dateEnrolled } : {}), ...(dateCompleted ? { dateCompleted } : {}), tab: tabId } }, undefined, { shallow: true });
  const openTab = (tabId: string) => {
    setOpenedTabIds((current) => current.includes(tabId) ? current : [...current, tabId]);
    navigateToTab(tabId);
  };
  const closeTab = (tabId: string) => {
    setOpenedTabIds((current) => current.filter((id) => id !== tabId));
    if (currentTab?.id !== tabId) return;
    const fallback = tabs.find((tab) => tab.displayByDefault) ?? tabs[0];
    if (fallback) navigateToTab(fallback.id);
  };
  const unopenedTabItems = unopenedTabs.map((tab) => ({ label: String(t(tab.translationKey, { defaultValue: tab.id })), command: () => openTab(tab.id) }));

  useEffect(() => {
    if (!patientUuid || !allowed) return;
    void audit("VIEWED_CLINICAL_DASHBOARD", selectedVisit?.uuid ? JSON.stringify({ visitUuid: selectedVisit.uuid }) : "", patientUuid, "MODULE_LABEL_CLINICAL_KEY");
  }, [allowed, patientUuid, selectedVisit?.uuid]);

  useEffect(() => {
    sawDashboardFetchRef.current = false;
    settledScrollKeyRef.current = "";
    dashboardScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [scrollKey]);

  useEffect(() => {
    if (dashboardFetching > 0) {
      sawDashboardFetchRef.current = true;
      return;
    }
    if (loading || !sawDashboardFetchRef.current || settledScrollKeyRef.current === scrollKey) return;
    const timer = window.setTimeout(() => {
      const element = dashboardScrollRef.current;
      if (!element) return;
      element.scrollTo({ top: 0, left: 0, behavior: "instant" });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      settledScrollKeyRef.current = scrollKey;
      setReadyScrollKey(scrollKey);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [dashboardFetching, loading, scrollKey]);

  useEffect(() => {
    if (loading || dashboardReady || dashboardFetching > 0 || sawDashboardFetchRef.current) return;
    const timer = window.setTimeout(() => {
      const element = dashboardScrollRef.current;
      if (!element) return;
      element.scrollTo({ top: 0, left: 0, behavior: "instant" });
      settledScrollKeyRef.current = scrollKey;
      setReadyScrollKey(scrollKey);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dashboardFetching, dashboardReady, loading, scrollKey]);

  return <AuthGuard><AppShell mainClassName="clinical-dashboard-page">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical requerido por el módulo legacy.</p>}
    {allowed && loading && <p role="status">Cargando contexto clínico…</p>}
    {allowed && (profile.isError || dashboard.isError || visits.isError || visitLocation.isError || visitSummary.isError) && <p role="alert" className="error-banner">No fue posible cargar completamente el contexto clínico.</p>}
    {allowed && !loading && patient && currentTab && dashboardContext && <div className="clinical-dashboard-workspace">
      <div className="clinical-dashboard-fixed">
      <section className="clinical-patient-header panel"><div><span className="clinical-eyebrow">{patient.identifier}</span><h2>{patient.name}</h2><p>{patient.gender || "Sexo no registrado"}{patient.age !== undefined ? ` · ${patient.age} años` : ""}</p></div><div className="clinical-visit-status"><strong>{selectedVisit?.visitType?.display ?? selectedVisit?.visitType?.name ?? "Sin visita activa"}</strong>{selectedVisit && <span>{selectedVisit.stopDatetime ? "Visita cerrada" : "Visita activa"}</span>}</div><div className="toolbar"><Button outlined label="Volver a búsqueda" icon="pi pi-users" onClick={() => void router.push("/clinical")} />{canAccessAdt && selectedVisit && <Button outlined label="Camas" icon="pi pi-building" aria-label="Ir al módulo de camas del paciente" onClick={() => void router.push(patientAdtUrl(patientUuid, selectedVisit.uuid))} />}<Button label="Consulta" icon="pi pi-file-edit" disabled={!consultationEnabled} tooltip={!consultationEnabled ? "Consulta permanece protegida hasta completar su certificación." : undefined} onClick={() => void router.push(activeConsultationRoute(patientUuid, activeVisit?.uuid, enrollmentUuid))} /></div></section>
      {pendingConsultation && !consultationEnabled && <p role="status" className="warning-banner">Se conservó el paciente y la visita. Consulta permanece protegida hasta terminar su certificación funcional.</p>}
      <nav className="clinical-tabs" aria-label="Dashboards clínicos">
        <div className="clinical-tab-list">
          {visibleTabs.map((tab) => <div key={tab.id} className={`clinical-tab ${tab.id === currentTab.id ? "selected" : ""}`}>
            <Button text={tab.id !== currentTab.id} label={String(t(tab.translationKey, { defaultValue: tab.id }))} onClick={() => openTab(tab.id)} />
            {!tab.displayByDefault && <Button text icon="pi pi-times" className="clinical-tab-close" aria-label={`Cerrar ${String(t(tab.translationKey, { defaultValue: tab.id }))}`} onClick={() => closeTab(tab.id)} />}
          </div>)}
          {unopenedTabs.length > 0 && <>
            <Menu model={unopenedTabItems} popup ref={dashboardMenuRef} id="clinical-dashboard-menu" />
            <Button text icon="pi pi-plus" className="clinical-tab-add" aria-label="Abrir otro dashboard" aria-haspopup aria-controls="clinical-dashboard-menu" onClick={(event) => dashboardMenuRef.current?.toggle(event)} />
          </>}
        </div>
      </nav>
      </div>
      <div className="clinical-dashboard-stage" aria-busy={!dashboardReady}>
      {!dashboardReady && <div className="clinical-dashboard-loader flex flex-column align-items-center justify-content-center gap-3 fadein animation-duration-300" role="status" aria-live="polite"><ProgressSpinner strokeWidth="3" /><span>Cargando…</span></div>}
      <div ref={dashboardScrollRef} className={`clinical-dashboard-scroll transition-duration-300 ${dashboardReady ? "opacity-100" : "opacity-0 pointer-events-none"}`} tabIndex={dashboardReady ? 0 : -1} aria-label="Contenido del dashboard clínico">
        {pendingTypes.length > 0 && <details className="warning-banner clinical-coverage"><summary>Controles configurados pendientes de migración en esta primera entrega ({pendingTypes.length})</summary><p>{pendingTypes.join(", ")}</p></details>}
        <div className="clinical-dashboard-layout">
          {dashboardLayout.map((block, blockIndex) => block.kind === "full" ? (
            <ClinicalDashboardMasonryItem
              key={`${currentTab.id}-${block.item.section.id}`}
              section={block.item.section}
              layoutOrder={block.item.layoutOrder}
            >
              <ClinicalDashboardSectionCard section={block.item.section} context={dashboardContext} />
            </ClinicalDashboardMasonryItem>
          ) : (
            <div className="clinical-dashboard-columns" key={`${currentTab.id}-columns-${blockIndex}`}>
              <div className="clinical-dashboard-column">
                {block.left.map(({ section, layoutOrder }) => (
                  <ClinicalDashboardMasonryItem key={`${currentTab.id}-${section.id}`} section={section} layoutOrder={layoutOrder}>
                    <ClinicalDashboardSectionCard section={section} context={dashboardContext} />
                  </ClinicalDashboardMasonryItem>
                ))}
              </div>
              <div className="clinical-dashboard-column">
                {block.right.map(({ section, layoutOrder }) => (
                  <ClinicalDashboardMasonryItem key={`${currentTab.id}-${section.id}`} section={section} layoutOrder={layoutOrder}>
                    <ClinicalDashboardSectionCard section={section} context={dashboardContext} />
                  </ClinicalDashboardMasonryItem>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>}
  </AppShell></AuthGuard>;
}
