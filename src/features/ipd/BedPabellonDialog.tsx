import { useQuery } from "@tanstack/react-query";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppFile } from "@/services/bahmni/config";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits } from "@/services/bahmni/visits";
import { parseClinicalDashboardConfig } from "@/config-compat/clinicalConfig";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { PabellonHistoryControl } from "@/features/clinical/pabellon/PabellonHistoryControl";

export function BedPabellonDialog({ patientUuid, visitUuid, onHide, requestOnly = false }: { patientUuid: string; visitUuid?: string; onHide(): void; requestOnly?: boolean }) {
  const { user, provider, location } = useAuth();
  const allowed = hasPrivilege(user, "app:clinical");
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed });
  const visits = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed });
  const config = useQuery({ queryKey: ["app-file", "clinical", "dashboard.json"], queryFn: () => loadAppFile("clinical", "dashboard.json"), enabled: allowed });
  const section = config.data ? parseClinicalDashboardConfig(config.data).flatMap(tab => tab.sections).find(item => item.type === "pabellonHospitalario") : undefined;
  const active = visits.data?.filter(item => !item.stopDatetime && item.voided !== true) ?? [];
  const visit = visitUuid ? visits.data?.find(item => item.uuid === visitUuid && item.voided !== true) : active.length === 1 ? active[0] : undefined;
  const failed = profile.isError || visits.isError || config.isError;
  const loading = profile.isPending || visits.isPending || config.isPending;
  return <Dialog draggable={false} header={requestOnly ? "Solicitar pabellón" : "Pabellón hospitalario"} visible modal blockScroll maximizable onHide={onHide} style={{ width: "96vw", maxWidth: "1500px" }} contentStyle={{ minHeight: "65vh" }}>
    {!allowed ? <p role="alert">No tiene permiso clínico para consultar Pabellón.</p> : failed ? <div role="alert"><p>No fue posible cargar el contexto del paciente.</p><Button label="Reintentar" onClick={() => { void profile.refetch(); void visits.refetch(); void config.refetch(); }} /></div> : loading ? <p role="status">Cargando paciente y atención…</p> : !section ? <p role="alert">Pabellón no está configurado en este ambiente.</p> : !hasPrivilege(user, section.requiredPrivilege) ? <p role="alert">No tiene permiso para esta sección.</p> : profile.data && <PabellonHistoryControl key={patientUuid + ":" + (visit?.uuid ?? "")} section={section} expanded context={{
      patient: toClinicalPatientContext(profile.data, patientUuid), visit, visits: visits.data ?? [],
      user, provider, location, locale: user?.userProperties?.defaultLocale ?? "es-CL",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago",
      privilegeNames: new Set(user?.privileges.map(item => item.name ?? item.display).filter((item): item is string => Boolean(item)) ?? []), tabs: [],
    }} autoRequest={requestOnly} reportState={() => {}} />}
  </Dialog>;
}
