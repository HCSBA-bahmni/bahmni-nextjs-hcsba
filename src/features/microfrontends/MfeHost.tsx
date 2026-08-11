import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import { useAuth } from "@/features/auth/AuthContext";
import type { ClinicalPatientContext } from "@/features/clinical/patientContext";
import { audit } from "@/services/bahmni/audit";
import { hostedClinicalMfeTypes } from "./manifest";
import type { BahmniMfeProps } from "./types";

const FormsV2Dashboard = dynamic<BahmniMfeProps>(() => import("./adapters/FormsV2Dashboard").then((module) => module.FormsV2Dashboard), { ssr: false, loading: () => <p role="status">Cargando microfrontend…</p> });
const AllOrdersDashboard = dynamic<BahmniMfeProps>(() => import("./adapters/AllOrdersDashboard").then((module) => module.AllOrdersDashboard), { ssr: false, loading: () => <p role="status">Cargando microfrontend…</p> });

const IpsDashboard = dynamic<BahmniMfeProps>(() => import("./adapters/IpsDashboard").then((module) => module.IpsDashboard), { ssr: false, loading: () => <p role="status">Cargando integración IPS…</p> });

const registry: Record<string, React.ComponentType<BahmniMfeProps>> = {
  forms: FormsV2Dashboard,
  formsV2React: FormsV2Dashboard,
  allOrdersReact: AllOrdersDashboard,
  ipsReact: IpsDashboard,
  ipsIcvpReact: IpsDashboard,
};

class MfeErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error("Clinical MFE failed", error.name, info.componentStack); }
  override render() { return this.state.failed ? <p role="alert" className="error-banner">No fue posible cargar este componente clínico.</p> : this.props.children; }
}

export function isHostedClinicalMfe(sectionType: string): boolean {
  return hostedClinicalMfeTypes.has(sectionType) && Boolean(registry[sectionType]);
}

export function ClinicalMfeHost({ section, patient, visitUuid, visitIsActive = false, visits = [] }: { section: ClinicalDashboardSection; patient: ClinicalPatientContext; visitUuid?: string; visitIsActive?: boolean; visits?: import("@/types/bahmni").Visit[] }) {
  const { user, provider, location } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const Component = registry[section.type];
  if (!Component) return <p role="alert" className="warning-banner">El adaptador React para {section.type} todavía no está registrado.</p>;
  const maximumVisits = section.dashboardConfig.maximumNoOfVisits;
  const props: BahmniMfeProps = {
    hostData: {
      patientUuid: patient.uuid,
      patient,
      visitUuid,
      visitIsActive,
      visits,
      provider,
      currentUser: user,
      location,
      locale: i18n.resolvedLanguage ?? i18n.language ?? "es",
      section,
      numberOfVisits: typeof maximumVisits === "number" || typeof maximumVisits === "string" ? maximumVisits : undefined,
      showEditForActiveEncounter: section.dashboardConfig.showEditForActiveEncounter === true,
    },
    hostApi: {
      refresh: async () => { await queryClient.invalidateQueries({ queryKey: ["clinical"] }); },
      navigate: async (href) => { await router.push(href); },
      openExpanded: async (sectionId = section.id) => { await router.push({ pathname: router.pathname, query: { ...router.query, expanded: sectionId } }, undefined, { shallow: true }); },
      print: () => window.print(),
      audit: async (eventType, message = "") => { await audit(eventType, message, patient.uuid, "MODULE_LABEL_CLINICAL_KEY"); },
    },
    tx: (key, fallback) => String(t(key, { defaultValue: fallback ?? key })),
  };
  return <MfeErrorBoundary><Component {...props} /></MfeErrorBoundary>;
}
