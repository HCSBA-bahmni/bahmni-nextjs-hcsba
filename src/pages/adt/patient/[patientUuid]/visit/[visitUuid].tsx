import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { Toast } from "primereact/toast";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { parseClinicalDashboardConfig } from "@/config-compat/clinicalConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { configuredAdtActionCodes, dischargeEncounterUuid, type AdtActionCode } from "@/features/adt/adtRules";
import { ClinicalDashboardSectionCard } from "@/features/clinical/ClinicalDashboardSection";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { getDispositionActionConcepts, undoDischarge } from "@/services/bahmni/adt";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppConfig, loadExtensions } from "@/services/bahmni/config";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getAssignedBed, ipdQueryKeys } from "@/services/bahmni/ipd";
import { getPatientVisits, getVisitSummary } from "@/services/bahmni/visits";

const extensionPoint: Record<AdtActionCode, string> = {
  ADMIT: "org.bahmni.adt.admit.action",
  TRANSFER: "org.bahmni.adt.transfer.action",
  DISCHARGE: "org.bahmni.adt.discharge.action",
  UNDO_DISCHARGE: "org.bahmni.adt.undo.discharge.action",
};
const spanishLabel: Record<AdtActionCode, string> = { ADMIT: "Admitir", TRANSFER: "Transferir", DISCHARGE: "Dar de alta", UNDO_DISCHARGE: "Deshacer alta" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function AdtPatientPage() {
  useClinicalTranslations();
  const router = useRouter();
  const client = useQueryClient();
  const toast = useRef<Toast>(null);
  const { user, provider, location } = useAuth();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const visitUuid = typeof router.query.visitUuid === "string" ? router.query.visitUuid : "";
  const allowed = hasPrivilege(user, "app:adt");
  const [selectedCode, setSelectedCode] = useState<AdtActionCode | undefined>();
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const visits = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const summary = useQuery({ queryKey: ["clinical-visit-summary", visitUuid], queryFn: () => getVisitSummary(visitUuid), enabled: allowed && Boolean(visitUuid) });
  const assignedBed = useQuery({ queryKey: ipdQueryKeys.assignedBed(patientUuid), queryFn: () => getAssignedBed(patientUuid), enabled: allowed && Boolean(patientUuid), staleTime: 30_000 });
  const app = useQuery({ queryKey: ["app-config", "adt"], queryFn: () => loadAppConfig("adt"), enabled: allowed });
  const extensions = useQuery({ queryKey: ["extensions", "adt"], queryFn: () => loadExtensions("adt"), enabled: allowed });
  const concepts = useQuery({ queryKey: ["adt", "disposition-actions"], queryFn: getDispositionActionConcepts, enabled: allowed });
  const config = record(app.data?.config ?? app.data);
  const dashboard = record(config.dashboard);
  const tab = useMemo(() => parseClinicalDashboardConfig({ adt: dashboard })[0], [dashboard]);
  const allowedCodes = assignedBed.isSuccess ? configuredAdtActionCodes(summary.data as Record<string, unknown> | undefined, Boolean(assignedBed.data)) : [];
  const options = (concepts.data ?? []).flatMap((concept) => concept.code && allowedCodes.includes(concept.code as AdtActionCode) ? [{ label: spanishLabel[concept.code as AdtActionCode] ?? concept.label, value: concept.code as AdtActionCode }] : []);
  const patient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const visit = (visits.data ?? []).find((candidate) => candidate.uuid === visitUuid);
  const privilegeNames = useMemo(() => new Set(user?.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const context = patient ? { patient, visit, visits: visits.data ?? [], visitSummary: summary.data as Record<string, unknown>, user, provider, location, locale: user?.userProperties?.defaultLocale ?? "es", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago", privilegeNames, tabs: tab ? [tab] : [] } : undefined;
  const actionExtensions = (extensions.data ?? []).filter((extension) => selectedCode && extension.extensionPointId === extensionPoint[selectedCode] && hasPrivilege(user, extension.requiredPrivilege));
  const reversal = useMutation({
    mutationFn: async () => {
      const encounterUuid = dischargeEncounterUuid(summary.data as Record<string, unknown> | undefined);
      if (!encounterUuid) throw new Error("OpenMRS no devolvió el encuentro de alta que debe anularse.");
      await undoDischarge(encounterUuid);
      const confirmed = await getVisitSummary(visitUuid);
      if (dischargeEncounterUuid(confirmed as Record<string, unknown> | undefined)) throw new Error("OpenMRS no confirmó la reversa del alta.");
      return confirmed;
    },
    onSuccess: async (confirmed) => {
      client.setQueryData(["clinical-visit-summary", visitUuid], confirmed);
      await client.invalidateQueries({ queryKey: ["clinical-visits", patientUuid] });
      toast.current?.show({ severity: "success", summary: "Alta revertida", detail: "OpenMRS confirmó la reversa del alta." });
      setSelectedCode(undefined);
    },
    onError: (error) => toast.current?.show({ severity: "error", summary: "No fue posible deshacer el alta", detail: error instanceof Error ? error.message : "Error no identificado." }),
  });
  const invoke = (action: string) => {
    if (action === "cancel") { setSelectedCode(undefined); return; }
    if (action === "undoDischarge") { reversal.mutate(); return; }
    void router.push({ pathname: `/bedmanagement/patient/${patientUuid}`, query: { visitUuid, action: selectedCode?.toLocaleLowerCase() } });
  };
  const loading = profile.isLoading || visits.isLoading || summary.isLoading || assignedBed.isLoading || app.isLoading || extensions.isLoading || concepts.isLoading;
  const failed = profile.isError || visits.isError || summary.isError || assignedBed.isError || app.isError || extensions.isError || concepts.isError;

  return <AuthGuard><AppShell mainClassName="adt-page"><Toast ref={toast} position="top-right" />
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:adt requerido por la configuración legacy.</p>}
    {allowed && loading && <p role="status">Cargando movimiento y contexto del paciente…</p>}
    {allowed && failed && <p role="alert" className="error-banner">No fue posible cargar completamente la configuración ADT.</p>}
    {allowed && !loading && patient && context && <>
      <section className="clinical-patient-header panel"><div><span className="clinical-eyebrow">{patient.identifier}</span><h2>{patient.name}</h2><p>{patient.gender || "Sexo no registrado"}{patient.age !== undefined ? ` · ${patient.age} años` : ""}</p></div><div className="clinical-visit-status"><strong>{visit?.visitType?.display ?? visit?.visitType?.name ?? "IPD"}</strong><span>{visit?.stopDatetime ? "Visita cerrada" : "Visita activa"}</span></div><div className="toolbar"><Button outlined label="Dashboard" icon="pi pi-home" onClick={() => void router.push({ pathname: `/clinical/patient/${patientUuid}/dashboard`, query: { visitUuid } })} /><Button label="Mapa de camas" icon="pi pi-building" onClick={() => void router.push({ pathname: `/bedmanagement/patient/${patientUuid}`, query: { visitUuid } })} /></div></section>
      <section className="panel adt-action-panel"><label htmlFor="adt-action">Movimiento del paciente</label><Dropdown inputId="adt-action" value={selectedCode} options={options} placeholder="Seleccionar" onChange={(event) => setSelectedCode(event.value as AdtActionCode)} />{selectedCode && <span className="toolbar">{actionExtensions.map((extension) => { const params = record(extension.extensionParams); const action = String(params.action ?? ""); const label = action === "cancel" ? "Cancelar" : selectedCode === "UNDO_DISCHARGE" ? "Deshacer alta" : String(params.display ?? spanishLabel[selectedCode]); return <Button key={extension.id} outlined={action === "cancel"} severity={selectedCode === "DISCHARGE" || selectedCode === "UNDO_DISCHARGE" ? "danger" : undefined} label={label} loading={reversal.isPending && action === "undoDischarge"} onClick={() => invoke(action)} />; })}</span>}</section>
      {assignedBed.isError && <p className="warning-banner">No fue posible confirmar la cama actual; las acciones ADT están deshabilitadas.</p>}
      {!assignedBed.isError && options.length === 0 && <p className="warning-banner">La visita tiene un estado que no corresponde a ninguna acción configurada en el concepto Disposition.</p>}
      <div className="adt-dashboard-layout">{(tab?.sections ?? []).filter((section) => hasPrivilege(user, section.requiredPrivilege)).map((section) => <ClinicalDashboardSectionCard key={section.id} section={section} context={context} />)}</div>
    </>}
  </AppShell></AuthGuard>;
}
