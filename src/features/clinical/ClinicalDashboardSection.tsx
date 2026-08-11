import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Dialog } from "primereact/dialog";
import { useRouter } from "next/router";
import { Component, useCallback, useState, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import { getDashboardControlAdapter } from "./DashboardControlRegistry";
import type { ClinicalDashboardContext, DashboardControlState } from "./dashboardContext";

class SectionErrorBoundary extends Component<{ children: ReactNode; sectionId: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error("Clinical dashboard control failed", this.props.sectionId, error.name, info.componentStack); }
  override render() { return this.state.failed ? <p role="alert" className="error-banner">Este control falló de forma aislada. Los demás datos del paciente continúan disponibles.</p> : this.props.children; }
}

export function ClinicalDashboardSectionCard({ section, context }: { section: ClinicalDashboardSection; context: ClinicalDashboardContext }) {
  const { t } = useTranslation();
  const [state, setState] = useState<DashboardControlState>({ empty: false, settled: false });
  const router = useRouter();
  const expanded = router.query.expanded === section.id;
  const reportState = useCallback((next: DashboardControlState) => setState((current) => current.empty === next.empty && current.settled === next.settled ? current : next), []);
  const adapter = getDashboardControlAdapter(section.type);
  const title = section.translationKey ? t(section.translationKey, { defaultValue: section.title ?? section.id }) : section.title ?? section.id;
  const setExpanded = (open: boolean) => {
    const query = { ...router.query };
    if (open) query.expanded = section.id; else delete query.expanded;
    void router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  };
  if (section.hideEmptyDisplayControl && state.settled && state.empty) return null;
  const content = <SectionErrorBoundary sectionId={section.id}><adapter.Component section={section} context={context} expanded={expanded} reportState={reportState} /></SectionErrorBoundary>;
  const header = <header className="clinical-card-header">
    <h2>{String(title)}</h2>
    <span className="clinical-card-header-actions">
      {adapter.HeaderAction && <adapter.HeaderAction section={section} context={context} />}
      {adapter.supportsExpanded && <Button text rounded icon="pi pi-window-maximize" aria-label={`Ampliar ${String(title)}`} onClick={() => setExpanded(true)} />}
    </span>
  </header>;
  return <section className={`clinical-card ${section.displayType === "Full-Page" ? "clinical-card-full" : "clinical-card-half"}`} data-control-type={section.type}>
    <Card className="clinical-dashboard-card" header={header}>{content}</Card>
    <Dialog visible={expanded} maximizable modal className="clinical-expanded-dialog" header={String(title)} onHide={() => setExpanded(false)}>{expanded && content}</Dialog>
  </section>;
}
