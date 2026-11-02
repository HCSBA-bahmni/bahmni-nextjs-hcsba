import type { ClinicalDashboardContext } from "@/features/clinical/dashboardContext";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import { ClinicalDashboardSectionCard } from "@/features/clinical/ClinicalDashboardSection";

export function ipdPabellonContextAllowed(context: ClinicalDashboardContext, visitUuid: string, source: unknown): boolean {
  // Native visit list is patient-scoped. Never infer membership from a URL,
  // name, bed, date range or a visit summary obtained independently.
  return source === "qa-isolated" && Boolean(context.user?.uuid && context.patient.uuid && visitUuid)
    && context.visit?.uuid === visitUuid
    && context.visits.filter(visit => visit.uuid === visitUuid).length === 1;
}
const section: ClinicalDashboardSection = {
  id: "ipd-pabellon-summary", sourceIndex: 0, title: "Pabellón hospitalario (QA)",
  type: "pabellonHospitalario", displayOrder: 0, displayType: "Full-Page",
  dashboardConfig: {}, expandedViewConfig: {}, config: { source: "qa-isolated" },
  formGroup: [], raw: {},
};
export function IpdPabellonSection({ context, visitUuid, source }: { context: ClinicalDashboardContext; visitUuid: string; source: unknown }) {
  if (!ipdPabellonContextAllowed(context, visitUuid, source)) return <p role="alert" className="warning-banner">No se consulta Pabellón: falta una atención verificada de este paciente o la activación QA.</p>;
  return <div key={`${context.user?.uuid}:${context.patient.uuid}:${visitUuid}`}>
    <p role="note">Historial quirúrgico del paciente. Las solicitudes existentes no acreditan un vínculo con esta atención; no se asocian automáticamente por fecha.</p>
    <ClinicalDashboardSectionCard section={section} context={context} />
  </div>;
}
