import Link from "next/link";
import { DateTime } from "luxon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
import { Toast } from "primereact/toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { parseCareViewConfig, parseIpdOperationalConfig } from "@/config-compat/careViewConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import {
  buildCareWindow,
  careTeamAction,
  careViewPatientDashboardHref,
  careWindowSlots,
  isPreviousPending,
  moveCareWindow,
  previousShiftWindow,
  readSelectedWard,
  saveSelectedWard,
  taskThresholds,
} from "@/features/ipd/care-view/domain";
import type { CareTask, CareTaskFilter, CareTimeWindow, CareViewPatient, CareViewPatientPage } from "@/features/ipd/care-view/types";
import { IpdModuleNavigation } from "@/features/ipd/IpdModuleNavigation";
import { useIpdTranslations } from "@/features/ipd/useIpdTranslations";
import { audit } from "@/services/bahmni/audit";
import { hasPrivilege } from "@/services/bahmni/auth";
import {
  careViewQueryKeys,
  getCareWardPatients,
  getCareWardSummary,
  getMedicationTasks,
  getMyCarePatients,
  getNonMedicationTasks,
  searchCarePatients,
  updateCareTeamParticipant,
} from "@/services/bahmni/careView";
import { loadAppConfig } from "@/services/bahmni/config";
import { getWards, ipdQueryKeys } from "@/services/bahmni/ipd";

const statusMeta = {
  pending: { label: "Pendiente", icon: "pi pi-clock" },
  administered: { label: "Administrada", icon: "pi pi-check" },
  "administered-late": { label: "Administrada tarde", icon: "pi pi-history" },
  missed: { label: "Omitida", icon: "pi pi-times" },
  late: { label: "Atrasada", icon: "pi pi-exclamation-triangle" },
  stopped: { label: "Detenida", icon: "pi pi-stop-circle" },
} as const;

function activeParticipant(patient: CareViewPatient) {
  const now = Date.now();
  return patient.careTeamParticipants.find((participant) => !participant.voided && (!participant.endTime || participant.endTime > now));
}

function TaskCard({ task, use24Hour }: { task: CareTask; use24Hour: boolean }) {
  const meta = statusMeta[task.status];
  const time = DateTime.fromMillis(task.scheduledTime).toFormat(use24Hour ? "HH:mm" : "hh:mm a");
  const dosage = [task.dose, task.doseUnit, task.route].filter((value) => value !== undefined && value !== "").join(" · ");
  return <article className={`care-task care-task-${task.status}`} title={`${meta.label}: ${task.name}`}>
    <span className="care-task-time">{time}</span>
    <i className={meta.icon} aria-hidden="true" />
    <div><strong>{task.name}</strong>{dosage && <small>{dosage}</small>}{task.creator && <small>por {task.creator}</small>}</div>
    <span className="sr-only">{meta.label}</span>
  </article>;
}

export function CareView() {
  useIpdTranslations();
  const { t } = useTranslation();
  const { user, provider } = useAuth();
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const auditSent = useRef(false);
  const partialErrors = useRef(new Set<string>());
  const allowed = hasPrivilege(user, "app:adt");
  const [selectedWardOverride, setSelectedWardOverride] = useState<string>();
  const [patientMode, setPatientMode] = useState<"all" | "mine">("all");
  const [taskFilter, setTaskFilter] = useState<CareTaskFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [first, setFirst] = useState(0);
  const [pageSizeOverride, setPageSizeOverride] = useState<number>();
  const [timeWindowOverride, setTimeWindowOverride] = useState<CareTimeWindow>();

  const careConfigQuery = useQuery({
    queryKey: careViewQueryKeys.config,
    queryFn: async () => parseCareViewConfig(await loadAppConfig("careViewDashboard")),
    enabled: allowed,
  });
  const operationalConfigQuery = useQuery({
    queryKey: careViewQueryKeys.operationalConfig,
    queryFn: async () => parseIpdOperationalConfig(await loadAppConfig("ipdDashboard")),
    enabled: allowed,
  });
  const wardsQuery = useQuery({ queryKey: ipdQueryKeys.wards, queryFn: getWards, enabled: allowed });

  const careConfig = careConfigQuery.data;
  const operationalConfig = operationalConfigQuery.data;
  const windowHours = careConfig?.timeframeLimitInHours ?? 2;
  const pageSize = pageSizeOverride ?? careConfig?.defaultPageSize ?? 10;
  const storedWard = provider && typeof window !== "undefined" ? readSelectedWard(window.localStorage, provider.uuid) : undefined;
  const selectedWard = selectedWardOverride
    ?? (wardsQuery.data?.some((entry) => entry.ward.uuid === storedWard) ? storedWard : wardsQuery.data?.[0]?.ward.uuid);
  const timeWindow = useMemo(() => timeWindowOverride
    ?? (operationalConfig ? buildCareWindow(DateTime.local(), operationalConfig.shifts, windowHours) : undefined),
  [operationalConfig, timeWindowOverride, windowHours]);

  useEffect(() => {
    if (!provider || !selectedWard || typeof window === "undefined") return;
    saveSelectedWard(window.localStorage, provider.uuid, selectedWard);
  }, [provider, selectedWard]);

  useEffect(() => {
    if (!allowed || !provider || auditSent.current) return;
    auditSent.current = true;
    void audit("VIEWED_WARD_LEVEL_DASHBOARD", "VIEWED_WARD_LEVEL_DASHBOARD", undefined, "MODULE_LABEL_INPATIENT_KEY");
  }, [allowed, provider]);

  const summaryQuery = useQuery({
    queryKey: careViewQueryKeys.summary(selectedWard, provider?.uuid),
    queryFn: () => getCareWardSummary(selectedWard!, provider!.uuid),
    enabled: allowed && Boolean(selectedWard && provider),
  });

  const loadPatients = () => {
    if (!selectedWard || !provider) return Promise.resolve({ patients: [], totalCount: 0 });
    if (submittedSearch) return searchCarePatients(selectedWard, submittedSearch, first, pageSize);
    return patientMode === "mine"
      ? getMyCarePatients(selectedWard, provider.uuid, first, pageSize)
      : getCareWardPatients(selectedWard, first, pageSize);
  };

  const patientsQueryKey = careViewQueryKeys.patients(selectedWard, patientMode, first, pageSize, submittedSearch);
  const patientsQuery = useQuery({
    queryKey: patientsQueryKey,
    queryFn: loadPatients,
    enabled: allowed && Boolean(selectedWard && provider),
    placeholderData: (previous) => previous,
  });
  const patients = useMemo(() => patientsQuery.data?.patients ?? [], [patientsQuery.data?.patients]);
  const patientUuids = useMemo(() => patients.map((patient) => patient.uuid), [patients]);
  const medicationThresholds = operationalConfig ? taskThresholds(operationalConfig, "medication") : undefined;
  const nonMedicationThresholds = operationalConfig ? taskThresholds(operationalConfig, "non-medication") : undefined;
  const previous = timeWindow && operationalConfig ? previousShiftWindow(timeWindow, operationalConfig.shifts) : undefined;

  const medicationQuery = useQuery({
    queryKey: careViewQueryKeys.tasks("medication", selectedWard, patientUuids, timeWindow?.start.toMillis(), timeWindow?.end.toMillis()),
    queryFn: () => getMedicationTasks(patientUuids, timeWindow!.start.toMillis(), timeWindow!.end.toMillis(), medicationThresholds!),
    enabled: Boolean(patientUuids.length && timeWindow && medicationThresholds && taskFilter !== "non-medication"),
    retry: 1,
  });
  const nonMedicationQuery = useQuery({
    queryKey: careViewQueryKeys.tasks("non-medication", selectedWard, patientUuids, timeWindow?.start.toMillis(), timeWindow?.end.toMillis()),
    queryFn: () => getNonMedicationTasks(patientUuids, timeWindow!.start.toMillis(), timeWindow!.end.toMillis(), nonMedicationThresholds!),
    enabled: Boolean(patientUuids.length && timeWindow && nonMedicationThresholds && taskFilter !== "medication"),
    retry: 1,
  });
  const previousMedicationQuery = useQuery({
    queryKey: careViewQueryKeys.tasks("previous-medication", selectedWard, patientUuids, previous?.start.toMillis(), previous?.end.toMillis()),
    queryFn: () => getMedicationTasks(patientUuids, previous!.start.toMillis(), previous!.end.toMillis(), medicationThresholds!),
    enabled: Boolean(patientUuids.length && previous && medicationThresholds),
    retry: 1,
  });
  const previousNonMedicationQuery = useQuery({
    queryKey: careViewQueryKeys.tasks("previous-non-medication", selectedWard, patientUuids, previous?.start.toMillis(), previous?.end.toMillis()),
    queryFn: () => getNonMedicationTasks(patientUuids, previous!.start.toMillis(), previous!.end.toMillis(), nonMedicationThresholds!),
    enabled: Boolean(patientUuids.length && previous && nonMedicationThresholds),
    retry: 1,
  });

  useEffect(() => {
    const domains = [
      ["medication", medicationQuery.isError, "No fue posible cargar los medicamentos; las otras tareas continúan disponibles."],
      ["non-medication", nonMedicationQuery.isError, "No fue posible cargar las tareas no farmacológicas; los medicamentos continúan disponibles."],
    ] as const;
    for (const [key, failed, detail] of domains) {
      if (failed && !partialErrors.current.has(key)) {
        partialErrors.current.add(key);
        toast.current?.show({ severity: "warn", summary: "Vista parcial", detail, life: 6500 });
      }
      if (!failed) partialErrors.current.delete(key);
    }
  }, [medicationQuery.isError, nonMedicationQuery.isError]);

  const currentTasks = useMemo(() => [
    ...(taskFilter === "non-medication" ? [] : medicationQuery.data ?? []),
    ...(taskFilter === "medication" ? [] : nonMedicationQuery.data ?? []),
  ].sort((left, right) => left.scheduledTime - right.scheduledTime), [medicationQuery.data, nonMedicationQuery.data, taskFilter]);
  const previousPending = useMemo(() => previous ? [
    ...(previousMedicationQuery.data ?? []),
    ...(previousNonMedicationQuery.data ?? []),
  ].filter((task) => isPreviousPending(task, previous)) : [], [previous, previousMedicationQuery.data, previousNonMedicationQuery.data]);

  const teamMutation = useMutation({
    retry: false,
    mutationFn: async ({ patient, action }: { patient: CareViewPatient; action: "assign" | "remove" }) => {
      if (!provider || !timeWindow) throw new Error("No hay un turno o proveedor vigente.");
      if (!patient.visitUuid) throw new Error("OpenMRS no informó la visita asociada a la cama.");
      let updatedCareTeam;
      if (action === "assign") {
        updatedCareTeam = await updateCareTeamParticipant({ patientUuid: patient.uuid, visitUuid: patient.visitUuid, participant: { providerUuid: provider.uuid, startTimeMillis: timeWindow.shiftStart.toMillis(), endTimeMillis: timeWindow.shiftEnd.toMillis() } });
      } else {
        const own = patient.careTeamParticipants.find((participant) => participant.providerUuid === provider.uuid && participant.uuid && !participant.voided);
        if (!own?.uuid) throw new Error("OpenMRS no informó la asignación que debe retirarse.");
        updatedCareTeam = await updateCareTeamParticipant({ patientUuid: patient.uuid, visitUuid: patient.visitUuid, participant: { uuid: own.uuid, voided: true } });
      }
      const current = updatedCareTeam.participants.find((participant) => !participant.voided && (!participant.endTime || participant.endTime > Date.now()));
      if ((action === "assign" && current?.providerUuid !== provider.uuid) || (action === "remove" && current?.providerUuid === provider.uuid)) {
        throw new Error("OpenMRS no confirmó el nuevo responsable del turno.");
      }
      return updatedCareTeam;
    },
    onSuccess: (updatedCareTeam, variables) => {
      queryClient.setQueryData<CareViewPatientPage>(patientsQueryKey, (current) => {
        if (!current) return current;
        if (variables.action === "remove" && patientMode === "mine") {
          return {
            ...current,
            patients: current.patients.filter((candidate) => candidate.uuid !== variables.patient.uuid),
            totalCount: Math.max(0, current.totalCount - 1),
          };
        }
        return {
          ...current,
          patients: current.patients.map((candidate) => candidate.uuid === variables.patient.uuid
            ? { ...candidate, careTeamParticipants: updatedCareTeam.participants }
            : candidate),
        };
      });
      void queryClient.invalidateQueries({ queryKey: careViewQueryKeys.summary(selectedWard, provider?.uuid) });
      toast.current?.show({ severity: "success", summary: "Equipo de cuidados", detail: variables.action === "assign" ? "Paciente asignado para el turno vigente." : "Asignación retirada.", life: 4000 });
    },
    onError: (error) => toast.current?.show({ severity: "error", summary: "No fue posible actualizar", detail: error instanceof Error ? error.message : "OpenMRS rechazó la operación.", life: 6500 }),
  });

  const submitSearch = () => {
    const value = searchDraft.trim();
    if (value.length > 0 && value.length < 3) {
      toast.current?.show({ severity: "info", summary: "Búsqueda", detail: "Ingrese al menos tres caracteres y presione Enter.", life: 4000 });
      return;
    }
    setFirst(0);
    setSubmittedSearch(value);
  };

  const changePage = (event: PaginatorPageChangeEvent) => {
    setFirst(event.first);
    setPageSizeOverride(event.rows);
  };

  const resetCurrentWindow = () => {
    setTimeWindowOverride(undefined);
  };

  const moveWindow = (direction: -1 | 1) => {
    if (!timeWindow) return;
    const moved = moveCareWindow(timeWindow, direction, windowHours);
    if (moved) setTimeWindowOverride(moved);
  };

  const slots = timeWindow ? careWindowSlots(timeWindow) : [];
  const isCurrentShift = timeWindow ? DateTime.local() >= timeWindow.shiftStart && DateTime.local() < timeWindow.shiftEnd : false;
  const formatTime = (value: DateTime) => value.toFormat(operationalConfig?.enable24HourTime ? "HH:mm" : "hh:mm a");
  const loading = careConfigQuery.isLoading || operationalConfigQuery.isLoading || wardsQuery.isLoading;

  return <AuthGuard><AppShell mainClassName="ipd-page care-view-page">
    <Toast ref={toast} position="top-right" />
    {!allowed && <p className="error-banner">No tiene el privilegio app:adt.</p>}
    {allowed && <>
      <IpdModuleNavigation activeMode="care-view" />
      <section className="panel care-view-shell">
        <header className="care-view-header">
          <div className="care-view-title"><span className="care-view-title-icon"><i className="pi pi-heart" /></span><div><small>Hospitalización</small><h1>{t("CARE_VIEW_TITLE", { defaultValue: "Vista de cuidados" })}</h1><p>Coordinación de pacientes y actividades por sala.</p></div></div>
          <div className="care-view-header-actions"><Button outlined icon="pi pi-refresh" label="Actualizar" loading={summaryQuery.isFetching || patientsQuery.isFetching} onClick={() => void Promise.all([summaryQuery.refetch(), patientsQuery.refetch(), medicationQuery.refetch(), nonMedicationQuery.refetch()])} /></div>
        </header>

        {loading && <p className="ipd-empty">Cargando configuración y salas…</p>}
        {(careConfigQuery.isError || operationalConfigQuery.isError || wardsQuery.isError) && <p className="error-banner">No fue posible cargar la configuración de Care View.</p>}
        {!loading && wardsQuery.data && <>
          <div className="care-view-controls">
            <label><span>Sala</span><Dropdown ariaLabel="Sala" pt={{ trigger: { "aria-label": "Abrir selector de sala" } }} value={selectedWard} options={wardsQuery.data.map((entry) => ({ label: entry.ward.display ?? entry.ward.name ?? "Sala", value: entry.ward.uuid }))} optionLabel="label" optionValue="value" onChange={(event) => { setSelectedWardOverride(String(event.value)); setFirst(0); setSubmittedSearch(""); }} /></label>
            <div className="care-view-summary" role="group" aria-label="Selección de pacientes">
              <button type="button" className={patientMode === "all" ? "selected" : undefined} onClick={() => { setPatientMode("all"); setFirst(0); }}><strong>{summaryQuery.data?.totalPatients ?? 0}</strong><span>Todos los pacientes</span></button>
              <button type="button" className={patientMode === "mine" ? "selected" : undefined} onClick={() => { setPatientMode("mine"); setFirst(0); }}><strong>{summaryQuery.data?.myPatients ?? 0}</strong><span>Mis pacientes</span></button>
            </div>
            <label className="care-view-search"><span>Buscar paciente</span><i className="pi pi-search" /><InputText value={searchDraft} placeholder="Cama, identificador o nombre" onChange={(event) => { setSearchDraft(event.target.value); if (!event.target.value) { setSubmittedSearch(""); setFirst(0); } }} onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} /></label>
            <label><span>Actividades</span><Dropdown ariaLabel="Actividades" pt={{ trigger: { "aria-label": "Abrir selector de actividades" } }} value={taskFilter} options={[{ label: "Todas", value: "all" }, { label: "Medicamentos", value: "medication" }, { label: "No farmacológicas", value: "non-medication" }]} optionLabel="label" optionValue="value" onChange={(event) => setTaskFilter(event.value as CareTaskFilter)} /></label>
          </div>

          <div className="care-view-period">
            <div><Button text icon="pi pi-chevron-left" aria-label="Período anterior" disabled={!timeWindow || !moveCareWindow(timeWindow, -1, windowHours)} onClick={() => moveWindow(-1)} /><Button outlined label="Período actual" onClick={resetCurrentWindow} /><Button text icon="pi pi-chevron-right" aria-label="Período siguiente" disabled={!timeWindow || !moveCareWindow(timeWindow, 1, windowHours)} onClick={() => moveWindow(1)} /></div>
            <strong>{timeWindow ? `${timeWindow.start.toFormat("dd LLL yyyy")} · ${formatTime(timeWindow.start)}–${formatTime(timeWindow.end)}` : "—"}</strong>
            {!isCurrentShift && <span className="care-view-past-warning"><i className="pi pi-info-circle" /> Consultando un período distinto del turno vigente</span>}
          </div>

          {patientsQuery.isError && <p className="error-banner">No fue posible cargar los pacientes de la sala seleccionada.</p>}
          <div className="care-view-table-scroll">
            <table className="care-view-table">
              <thead><tr><th>Paciente</th>{slots.map((slot) => <th key={slot.start.toMillis()}>{formatTime(slot.start)}–{formatTime(slot.end)}</th>)}</tr></thead>
              <tbody>
                {patients.map((patient) => {
                  const responsible = activeParticipant(patient);
                  const action = provider && timeWindow ? careTeamAction(patient.careTeamParticipants, provider.uuid, timeWindow) : "blocked";
                  const patientPrevious = previousPending.filter((task) => task.patientUuid === patient.uuid);
                  return <tr key={patient.uuid}>
                    <th scope="row"><div className="care-patient">
                      <div className="care-patient-bed"><i className="pi pi-building" /><strong>{patient.bedNumber ?? "Sin cama"}</strong></div>
                      <Link href={careViewPatientDashboardHref(patient)}>{patient.name}</Link>
                      <small>{[patient.identifier, patient.gender, patient.age !== undefined ? `${patient.age} años` : undefined].filter(Boolean).join(" · ")}</small>
                      {patient.hasNewTreatments && <Link className="care-alert-link" href={careViewPatientDashboardHref(patient)}><i className="pi pi-bell" /> Tratamientos nuevos</Link>}
                      {patientPrevious.length > 0 && <Link className="care-alert-link warning" href={careViewPatientDashboardHref(patient)}><i className="pi pi-exclamation-triangle" /> {patientPrevious.length} pendiente{patientPrevious.length === 1 ? "" : "s"} anterior{patientPrevious.length === 1 ? "" : "es"}</Link>}
                      <div className="care-team"><span>Responsable: <strong>{responsible?.providerName ?? "Sin asignar"}</strong></span>{action === "assign" && <Button text size="small" icon="pi pi-user-plus" label="Asignarme" disabled={teamMutation.isPending} onClick={() => teamMutation.mutate({ patient, action: "assign" })} />}{action === "remove" && <Button text size="small" severity="secondary" icon="pi pi-user-minus" label="Retirarme" disabled={teamMutation.isPending} onClick={() => teamMutation.mutate({ patient, action: "remove" })} />}</div>
                    </div></th>
                    {slots.map((slot) => <td key={slot.start.toMillis()}>{currentTasks.filter((task) => task.patientUuid === patient.uuid && task.scheduledTime >= slot.start.toMillis() && task.scheduledTime < slot.end.toMillis()).map((task) => <TaskCard key={task.uuid} task={task} use24Hour={Boolean(operationalConfig?.enable24HourTime)} />)}</td>)}
                  </tr>;
                })}
              </tbody>
            </table>
            {!patientsQuery.isLoading && patients.length === 0 && <p className="ipd-empty">No hay pacientes para los filtros seleccionados.</p>}
          </div>

          <footer className="care-view-footer">
            <div className="care-status-legend" aria-label="Leyenda de estados">{Object.entries(statusMeta).map(([status, meta]) => <span className={`care-status-${status}`} key={status}><i className={meta.icon} /> {meta.label}</span>)}</div>
            <Paginator first={first} rows={pageSize} totalRecords={patientsQuery.data?.totalCount ?? 0} rowsPerPageOptions={careConfig?.pageSizeOptions ?? [10, 20, 30, 40, 50]} onPageChange={changePage} template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown" currentPageReportTemplate="{first}–{last} de {totalRecords}" pt={{ RPPDropdown: { trigger: { "aria-label": "Abrir selector de pacientes por página" }, select: { "aria-label": "Pacientes por página" } } }} />
          </footer>
        </>}
      </section>
    </>}
  </AppShell></AuthGuard>;
}
