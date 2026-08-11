import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import Image from "next/image";
import { Button } from "primereact/button";
import { AppShell } from "@/components/AppShell";
import type { IpdDashboardConfig, IpdDashboardSectionConfig } from "@/config-compat/ipdDashboardConfig";
import { parseIpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";
import type { ClinicalDashboardSection, ClinicalDashboardTab } from "@/config-compat/clinicalConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { ClinicalDashboardSectionCard } from "@/features/clinical/ClinicalDashboardSection";
import type { ClinicalDashboardContext } from "@/features/clinical/dashboardContext";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppConfig } from "@/services/bahmni/config";
import { getAssignedBed, ipdQueryKeys } from "@/services/bahmni/ipd";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits, getVisitSummary } from "@/services/bahmni/visits";
import { IpdTaskSection } from "./ipd-dashboard/IpdTaskSection";
import { IpdVitalsSection } from "./ipd-dashboard/IpdVitalsSection";
import { useIpdTranslations } from "./useIpdTranslations";

interface Props { patientUuid: string; visitUuid: string }

const sectionTitles: Record<string, string> = {
  VT: "Signos vitales y valores nutricionales",
  AL: "Alergias",
  DG: "Diagnósticos",
  TR: "Tratamientos",
  NT: "Tareas de enfermería",
  DC: "Gráfico de medicamentos",
};

const sectionIcons: Record<string, string> = {
  VT: "pi pi-heart",
  AL: "pi pi-exclamation-circle",
  DG: "pi pi-file-edit",
  TR: "pi pi-briefcase",
  NT: "pi pi-list-check",
  DC: "pi pi-calendar-clock",
};

function clinicalSection(section: IpdDashboardSectionConfig, ipdConfig: IpdDashboardConfig): ClinicalDashboardSection | undefined {
  const base = {
    id: `ipd-${section.componentKey.toLowerCase()}`,
    sourceIndex: section.displayOrder,
    title: sectionTitles[section.componentKey] ?? section.title,
    displayOrder: section.displayOrder,
    displayType: "Full-Page" as const,
    dashboardConfig: {},
    expandedViewConfig: {},
    config: {},
    formGroup: [],
    raw: { ...section.extensions, title: sectionTitles[section.componentKey] ?? section.title },
  };
  if (section.componentKey === "VT") return undefined;
  if (section.componentKey === "AL") return { ...base, type: "allergies", dashboardConfig: { legacyIpdColumns: true } };
  if (section.componentKey === "DG") return { ...base, type: "diagnosis", dashboardConfig: { legacyIpdColumns: true, showCertainty: true, showOrder: true, showRuledOutDiagnoses: true } };
  if (section.componentKey === "TR") return { ...base, type: "treatment", dashboardConfig: {
    numberOfVisits: 10,
    showListView: true,
    showFlowSheet: false,
    showOtherActive: true,
    legacyIpd: true,
    ipdScheduleConfig: {
      ...ipdConfig.treatmentSchedule,
      timeInMinutesToDisableSlotPostScheduledTime: ipdConfig.drugChartSlider.timeInMinutesToDisableSlotPostScheduledTime,
    },
  } };
  return undefined;
}

export function IpdDashboard({ patientUuid, visitUuid }: Props) {
  useIpdTranslations();
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const allowed = hasPrivilege(user, "app:adt");
  const configQuery = useQuery({ queryKey: ["app-config", "ipdDashboard"], queryFn: async () => parseIpdDashboardConfig(await loadAppConfig("ipdDashboard")), enabled: allowed });
  const profileQuery = useQuery({ queryKey: ipdQueryKeys.patient(patientUuid), queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const assignedQuery = useQuery({ queryKey: ipdQueryKeys.assignedBed(patientUuid, visitUuid), queryFn: () => getAssignedBed(patientUuid, visitUuid), enabled: allowed && Boolean(patientUuid && visitUuid) });
  const visitsQuery = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const summaryQuery = useQuery({ queryKey: ["clinical-visit-summary", visitUuid], queryFn: () => getVisitSummary(visitUuid), enabled: allowed && Boolean(visitUuid) });
  const patient = profileQuery.data ? toClinicalPatientContext(profileQuery.data, patientUuid) : undefined;
  const visit = (visitsQuery.data ?? []).find((candidate) => candidate.uuid === visitUuid);
  const sections = configQuery.data?.sections ?? [];
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const tab = useMemo<ClinicalDashboardTab>(() => ({ id: "ipd", translationKey: "IPD", displayByDefault: true, sections: [], raw: {} }), []);
  const context = useMemo<ClinicalDashboardContext | undefined>(() => patient ? {
    patient,
    visit,
    visits: visitsQuery.data ?? [],
    visitSummary: summaryQuery.data as Record<string, unknown> | undefined,
    user,
    provider,
    location,
    locale: user?.userProperties?.defaultLocale ?? "es-CL",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago",
    privilegeNames,
    tabs: [tab],
  } : undefined, [location, patient, privilegeNames, provider, summaryQuery.data, tab, user, visit, visitsQuery.data]);
  const loading = configQuery.isLoading || profileQuery.isLoading || assignedQuery.isLoading || visitsQuery.isLoading || summaryQuery.isLoading;
  const failed = configQuery.isError || profileQuery.isError || assignedQuery.isError || visitsQuery.isError || summaryQuery.isError;
  const assignedLabel = assignedQuery.data
    ? [assignedQuery.data.wardName, assignedQuery.data.roomName, assignedQuery.data.bedNumber].filter(Boolean).join(" · ")
    : "Sin cama asignada";
  const dashboardReadOnly = Boolean(visit?.stopDatetime ?? summaryQuery.data?.stopDateTime ?? summaryQuery.data?.stopDatetime);
  const fromCareView = router.query.source === "careViewDashboard";
  const firstSectionId = sections[0] ? `ipd-section-${sections[0].componentKey.toLowerCase()}` : "ipd-dashboard-top";

  return <AuthGuard><AppShell mainClassName="ipd-page ipd-individual-dashboard">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:adt requerido por el dashboard IPD.</p>}
    {allowed && loading && <p role="status" className="ipd-empty">Cargando dashboard IPD…</p>}
    {allowed && failed && <p role="alert" className="error-banner">No fue posible cargar completamente el dashboard IPD. Reintente actualizando la vista.</p>}
    {allowed && !loading && patient && context && configQuery.data && <>
      <section className="panel ipd-individual-patient-header" id="ipd-dashboard-top">
        <Image src={patient.image} alt="" width={64} height={64} unoptimized />
        <div className="ipd-individual-patient-identity"><span className="clinical-eyebrow">Hospitalización</span><h1>{patient.name}</h1><p>{patient.identifier} · {patient.gender || "Sexo no registrado"}{patient.age !== undefined ? ` · ${patient.age} años` : ""}</p></div>
        <div className="ipd-individual-bed"><i className="pi pi-building" /><span><small>Cama actual</small><strong>{assignedLabel}</strong></span></div>
        <div className="toolbar">
          {fromCareView && <Button outlined label="Volver a Vista de cuidados" icon="pi pi-heart" onClick={() => void router.push("/bedmanagement/care-view")} />}
          <Button outlined label="Gestionar cama" icon="pi pi-building" onClick={() => void router.push({ pathname: `/bedmanagement/patient/${patientUuid}`, query: { visitUuid } })} />
          <Button label="Dashboard clínico" icon="pi pi-user" onClick={() => void router.push({ pathname: `/clinical/patient/${patientUuid}/dashboard`, query: { visitUuid } })} />
        </div>
      </section>

      <div className="ipd-individual-layout">
        <nav className="panel ipd-individual-nav" aria-label="Secciones del dashboard IPD">
          <strong>Resumen IPD</strong>
          {sections.map((section) => <a href={`#ipd-section-${section.componentKey.toLowerCase()}`} key={section.componentKey}><i className={sectionIcons[section.componentKey] ?? "pi pi-circle"} /><span>{sectionTitles[section.componentKey] ?? section.title}</span></a>)}
        </nav>
        <main className="ipd-individual-content">
          {sections.map((section) => {
            const id = `ipd-section-${section.componentKey.toLowerCase()}`;
            const mapped = clinicalSection(section, configQuery.data);
            return <section className={`panel ipd-individual-section ipd-individual-section-${section.componentKey.toLowerCase()}`} id={id} key={section.componentKey}>
              <header><span><i className={sectionIcons[section.componentKey] ?? "pi pi-circle"} /><h2>{sectionTitles[section.componentKey] ?? section.title}</h2></span><a href={`#${firstSectionId}`} aria-label="Volver al inicio del contenido"><i className="pi pi-chevron-up" /></a></header>
              <div>{mapped ? <ClinicalDashboardSectionCard section={mapped} context={context} /> : section.componentKey === "VT" ? <IpdVitalsSection patientUuid={patientUuid} config={configQuery.data.vitalsConfig} locale={context.locale} timeZone={context.timeZone} /> : section.componentKey === "NT" ? <IpdTaskSection patientUuid={patientUuid} visitUuid={visitUuid} locationUuid={location?.uuid} config={configQuery.data} kind="nursing" readOnly={dashboardReadOnly} /> : section.componentKey === "DC" ? <IpdTaskSection patientUuid={patientUuid} visitUuid={visitUuid} locationUuid={location?.uuid} config={configQuery.data} kind="drug-chart" readOnly={dashboardReadOnly} /> : <p className="warning-banner">El componente configurado {section.componentKey} aún no dispone de adaptador.</p>}</div>
            </section>;
          })}
        </main>
      </div>
    </>}
  </AppShell></AuthGuard>;
}
