import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { parseClinicalVisitConfig } from "@/config-compat/visitConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { ClinicalDashboardSectionCard } from "@/features/clinical/ClinicalDashboardSection";
import { dashboardControlTypes } from "@/features/clinical/DashboardControlRegistry";
import type { ClinicalDashboardContext } from "@/features/clinical/dashboardContext";
import { activeConsultationRoute } from "@/features/clinical/navigationLinks";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { audit } from "@/services/bahmni/audit";
import { getLoginLocations, hasPrivilege } from "@/services/bahmni/auth";
import { loadAppConfig, loadAppFile } from "@/services/bahmni/config";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits, getVisitDetails, getVisitSummary } from "@/services/bahmni/visits";
import { getRuntimeConfig } from "@/services/runtimeConfig";
import type { Visit } from "@/types/bahmni";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;

function providerForVisit(visit: Visit | undefined, encounterTypes: string[]): string | undefined {
  const encounters = records(visit?.encounters)
    .filter((encounter) => !encounterTypes.length || encounterTypes.includes(text(record(encounter.encounterType).display) ?? ""))
    .sort((left, right) => String(left.encounterDatetime ?? "").localeCompare(String(right.encounterDatetime ?? "")));
  return text(record(encounters[0]?.provider).display);
}

function formatVisitDate(value: string | undefined, locale: string, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(date);
}

function visitTypeLabel(visit: Visit | undefined, summary: unknown): string {
  const summaryType = record(record(summary).visitType);
  return visit?.visitType?.display ?? visit?.visitType?.name ?? text(summaryType.display) ?? text(summaryType.name) ?? text(record(summary).visitType) ?? "Visita";
}

function certificateAddress(location: unknown): string | undefined {
  const display = text(records(record(location).attributes)[0]?.display);
  if (!display) return undefined;
  const [, address] = display.split(": ", 2);
  return address || undefined;
}

export default function ClinicalVisitPage() {
  useClinicalTranslations();
  const { t } = useTranslation();
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const visitUuid = typeof router.query.visitUuid === "string" ? router.query.visitUuid : "";
  const requestedTab = typeof router.query.tab === "string" ? router.query.tab : "";
  const allowed = hasPrivilege(user, "app:clinical");
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const configuration = useQuery({ queryKey: ["app-file", "clinical", "visit.json"], queryFn: () => loadAppFile("clinical", "visit.json"), enabled: allowed });
  const clinicalAppConfiguration = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical"), enabled: allowed });
  const visits = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const visit = useQuery({ queryKey: ["clinical-visit-details", visitUuid], queryFn: () => getVisitDetails(visitUuid), enabled: allowed && Boolean(visitUuid) });
  const visitSummary = useQuery({ queryKey: ["clinical-visit-summary", visitUuid], queryFn: () => getVisitSummary(visitUuid), enabled: allowed && Boolean(visitUuid) });
  const runtimeConfig = useQuery({ queryKey: ["runtime-config"], queryFn: getRuntimeConfig, enabled: allowed });
  const appConfig = record(record(clinicalAppConfiguration.data).config);
  const showProviderInfo = appConfig.showProviderInfoinVisits !== false;
  const loginLocations = useQuery({ queryKey: ["login-locations", "visit-certificate"], queryFn: getLoginLocations, enabled: allowed && showProviderInfo });
  const tabs = useMemo(() => configuration.data && patientUuid && visitUuid ? parseClinicalVisitConfig(configuration.data, patientUuid, visitUuid) : [], [configuration.data, patientUuid, visitUuid]);
  const currentTab = tabs.find((tab) => tab.id === requestedTab) ?? tabs.find((tab) => tab.displayByDefault) ?? tabs[0];
  const patient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const locale = user?.userProperties?.defaultLocale ?? "es";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago";
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const selectedVisit = visit.data ?? (visits.data ?? []).find((candidate) => candidate.uuid === visitUuid);
  const orderedVisits = useMemo(() => [...(visits.data ?? [])].sort((left, right) => new Date(left.startDatetime).getTime() - new Date(right.startDatetime).getTime()), [visits.data]);
  const visitIndex = orderedVisits.findIndex((candidate) => candidate.uuid === visitUuid);
  const previousVisit = visitIndex > 0 ? orderedVisits[visitIndex - 1] : undefined;
  const nextVisit = visitIndex >= 0 && visitIndex < orderedVisits.length - 1 ? orderedVisits[visitIndex + 1] : undefined;
  const activeVisit = orderedVisits.find((candidate) => !candidate.stopDatetime);
  const encounterTypes = Array.isArray(record(currentTab?.raw.encounterContext).filterEncounterTypes)
    ? (record(currentTab?.raw.encounterContext).filterEncounterTypes as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const visitProvider = providerForVisit(selectedVisit, encounterTypes);
  const certificateLocation = loginLocations.data?.[0];
  const certificateLocationAddress = certificateAddress(certificateLocation);
  const visibleSections = (currentTab?.sections ?? []).filter((section) => hasPrivilege(user, section.requiredPrivilege));
  const pendingTypes = [...new Set(visibleSections.filter((section) => !dashboardControlTypes.has(section.type)).map((section) => section.type))];
  const dashboardContext: ClinicalDashboardContext | undefined = patient && selectedVisit ? {
    patient, visit: selectedVisit, visits: orderedVisits, visitSummary: visitSummary.data as Record<string, unknown> | undefined,
    user, provider, location, locale, timeZone, privilegeNames, tabs, surface: "visit", visitProviderName: visitProvider,
  } : undefined;
  // Angular resolves the visit list first and fetches provider metadata as a
  // best-effort enhancement. Old visits must remain visible if that auxiliary
  // request (or the admission summary) is unavailable.
  const loading = profile.isLoading || configuration.isLoading || visits.isLoading || (!selectedVisit && visit.isLoading);
  const failed = profile.isError || configuration.isError || visits.isError || (!selectedVisit && !visit.isLoading);

  const navigateVisit = (target: Visit | undefined) => {
    if (!target) return;
    void router.push({ pathname: `/clinical/patient/${patientUuid}/visit/${target.uuid}`, query: currentTab ? { tab: currentTab.id } : {} });
  };
  const navigateTab = (tabId: string) => void router.push({ pathname: `/clinical/patient/${patientUuid}/visit/${visitUuid}`, query: { tab: tabId } }, undefined, { shallow: true });

  useEffect(() => {
    if (!allowed || !patientUuid || !visitUuid) return;
    void audit("VIEWED_VISIT_DASHBOARD", JSON.stringify({ visitUuid }), patientUuid, "MODULE_LABEL_CLINICAL_KEY");
  }, [allowed, patientUuid, visitUuid]);

  return <AuthGuard><AppShell mainClassName="clinical-visit-page">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical requerido por el módulo legacy.</p>}
    {allowed && loading && <p role="status">Cargando resumen de la visita…</p>}
    {allowed && failed && <p role="alert" className="error-banner">No fue posible cargar completamente la visita seleccionada.</p>}
    {allowed && !loading && !failed && patient && selectedVisit && currentTab && dashboardContext && <div className="clinical-visit-workspace">
      <header className="clinical-visit-header panel">
        <div className="clinical-visit-patient">
          <span className="clinical-eyebrow">{patient.identifier}</span><h1>{patient.name}</h1><button type="button" onClick={() => void router.push({ pathname: `/clinical/patient/${patientUuid}/dashboard`, query: { visitUuid } })}>Volver al dashboard del paciente</button>
        </div>
        <nav className="clinical-visit-tabs" aria-label="Secciones de la visita">{tabs.map((tab) => <Button key={tab.id} text={tab.id !== currentTab.id} label={String(t(tab.translationKey, { defaultValue: tab.id }))} onClick={() => navigateTab(tab.id)} />)}</nav>
        <div className="toolbar"><Button outlined icon="pi pi-print" label="Imprimir" onClick={() => window.print()} /><Button icon="pi pi-file-edit" label="Consulta" disabled={runtimeConfig.data?.features.clinicalConsultationEnabled !== true} onClick={() => void router.push(activeConsultationRoute(patientUuid, activeVisit?.uuid))} /></div>
      </header>

      <nav className="clinical-visit-selector panel" aria-label="Navegar entre visitas">
        <Button text rounded className="clinical-visit-selector-button" icon="pi pi-chevron-left" aria-label="Visita anterior" disabled={!previousVisit} onClick={() => navigateVisit(previousVisit)} />
        <div className="clinical-visit-selector-value">
          <strong>{formatVisitDate(selectedVisit.startDatetime, locale, timeZone)}{selectedVisit.stopDatetime ? ` – ${formatVisitDate(selectedVisit.stopDatetime, locale, timeZone)}` : ""}</strong>
          <span className="clinical-visit-type">{visitTypeLabel(selectedVisit, visitSummary.data)}</span>
          {!selectedVisit.stopDatetime && <i className="pi pi-star-fill" role="img" aria-label="Visita activa" title="Visita activa" />}
        </div>
        <Button text rounded className="clinical-visit-selector-button" icon="pi pi-chevron-right" aria-label="Visita siguiente" disabled={!nextVisit} onClick={() => navigateVisit(nextVisit)} />
      </nav>

      {showProviderInfo && <section className="clinical-visit-provider panel" aria-label="Contexto de atención">
        <div><span className="clinical-visit-provider-icon"><i className="pi pi-user" /></span><span><small>Profesional</small><strong>{visitProvider ?? "—"}</strong></span></div>
        <div><span className="clinical-visit-provider-icon"><i className="pi pi-building" /></span><span><small>Centro de atención</small><strong>{certificateLocation?.name ?? certificateLocation?.display ?? "—"}</strong>{certificateLocationAddress && <em>{certificateLocationAddress}</em>}</span></div>
      </section>}

      {pendingTypes.length > 0 && <p role="alert" className="warning-banner">Controles de esta pestaña pendientes de adaptador: {pendingTypes.join(", ")}.</p>}
      <div className="clinical-visit-sections">{visibleSections.map((section) => <ClinicalDashboardSectionCard key={`${currentTab.id}-${section.id}`} section={section} context={dashboardContext} />)}</div>
    </div>}
  </AppShell></AuthGuard>;
}
