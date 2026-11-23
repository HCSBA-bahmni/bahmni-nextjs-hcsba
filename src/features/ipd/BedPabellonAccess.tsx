import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppFile } from "@/services/bahmni/config";
import { parseClinicalDashboardConfig } from "@/config-compat/clinicalConfig";
import { DEV_PABELLON_SOURCE, QA_PABELLON_SOURCE, getPabellonHistory, type PabellonPage } from "@/services/bahmni/pabellon";

export function bedPabellonLabel(page?: PabellonPage) {
  if (!page) return "Pabellón";
  if (!page.items.length) return "Solicitar pabellón";
  return page.items.some(item => item.newborns && (item.newborns.eligible || item.newborns.records.length > 0))
    ? "Ver solicitudes y recién nacidos" : "Ver solicitudes";
}
export function BedPabellonAccess({ patientUuid, onOpen }: { patientUuid: string; onOpen(requestOnly: boolean): void }) {
  const { user } = useAuth();
  const allowed = hasPrivilege(user, "app:clinical");
  const config = useQuery({ queryKey: ["app-file", "clinical", "dashboard.json"], queryFn: () => loadAppFile("clinical", "dashboard.json"), enabled: allowed });
  const section = config.data ? parseClinicalDashboardConfig(config.data).flatMap(tab => tab.sections).find(item => item.type === "pabellonHospitalario") : undefined;
  const source = section?.config.source === "pabellon43-dev" ? DEV_PABELLON_SOURCE : section?.config.source === "qa-isolated" ? QA_PABELLON_SOURCE : undefined;
  const history = useQuery({ queryKey: ["bed-pabellon-access", source?.environment, user?.uuid, patientUuid], queryFn: ({ signal }) => getPabellonHistory(patientUuid, undefined, signal, source!), enabled: allowed && Boolean(source) && hasPrivilege(user, section?.requiredPrivilege), retry: false, staleTime: 0, gcTime: 0 });
  if (!allowed || !source || !hasPrivilege(user, section?.requiredPrivilege)) return null;
  return <Button outlined className="ipd-pabellon-access" icon="pi pi-briefcase" label={bedPabellonLabel(history.data)} loading={history.isFetching} title={history.isError ? "No se pudo verificar el historial; abrir Pabellón para reintentar." : "Consultar solicitudes y documentos quirúrgicos"} onClick={() => onOpen(history.isSuccess && history.data.items.length === 0)} />;
}
