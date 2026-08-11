import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";
import type { IpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";
import type { CareTask } from "@/features/ipd/care-view/types";
import { useAuth } from "@/features/auth/AuthContext";
import { audit } from "@/services/bahmni/audit";
import { hasPrivilege } from "@/services/bahmni/auth";
import {
  getPatientMedicationTasks,
  getPatientNonMedicationTasks,
  updateNonMedicationTasks,
  updateScheduledMedicationAdministrations,
} from "@/services/bahmni/careView";
import { currentIpdShift, type IpdShiftWindow } from "./domain";
import {
  adjacentIpdShift,
  buildMedicationAdministration,
  buildNonMedicationUpdate,
  canNavigateToNextIpdShift,
  canAddNursingTask,
  isSystemGeneratedTask,
  isTaskFinal,
  isTaskRelevant,
  matchesNursingTaskFilter,
  medicationCompletionNeedsNotes,
  sameShift,
  shiftForScheduledTask,
  taskRequiredPrivilege,
  type NursingTaskAction,
  type NursingTaskFilter,
} from "./nursingTasks";
import { IpdAddTaskDialog } from "./IpdAddTaskDialog";

const statusLabels: Record<CareTask["status"], string> = {
  pending: "Pendiente",
  administered: "Completada",
  "administered-late": "Administrada con retraso",
  missed: "Olvidada / Saltada",
  late: "Tarde",
  stopped: "Parada",
};

const statusIcons: Record<CareTask["status"], string> = {
  pending: "pi pi-circle",
  administered: "pi pi-check-circle",
  "administered-late": "pi pi-history",
  missed: "pi pi-ban",
  late: "pi pi-clock",
  stopped: "pi pi-stop-circle",
};

const filterOptions: Array<{ label: string; value: NursingTaskFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Completadas", value: "completed" },
  { label: "Pendientes", value: "pending" },
  { label: "Según necesidad (PRN)", value: "prn" },
  { label: "Detenidas", value: "stopped" },
  { label: "Omitidas", value: "skipped" },
  { label: "No realizadas", value: "missed" },
];

interface Props {
  patientUuid: string;
  visitUuid: string;
  locationUuid?: string;
  config: IpdDashboardConfig;
  kind: "nursing" | "drug-chart";
  readOnly?: boolean;
}

function NursingTaskBoard({ tasks, use24Hour, onManage, canManage }: { tasks: CareTask[]; use24Hour: boolean; onManage: (task: CareTask) => void; canManage: (task: CareTask) => boolean }) {
  const groups = [...new Set(tasks.map((task) => task.scheduledTime))].map((scheduledTime) => ({
    scheduledTime,
    tasks: tasks.filter((task) => task.scheduledTime === scheduledTime),
  }));

  return <div className="ipd-nursing-task-board" aria-label="Actividades del turno">
    {groups.map((group) => <article className="ipd-nursing-task-slot" key={group.scheduledTime}>
      <header>
        <time>{DateTime.fromMillis(group.scheduledTime).toFormat(use24Hour ? "HH:mm" : "hh:mm a")}</time>
        {group.tasks.length > 1 && <span>{group.tasks.length} actividades</span>}
      </header>
      <div className="ipd-nursing-task-list">
        {group.tasks.map((task) => <div className={`ipd-nursing-task ipd-nursing-task-${task.status}`} key={task.uuid}>
          <i className={statusIcons[task.status]} aria-hidden="true" />
          <div className="ipd-nursing-task-detail">
            <strong>{task.name}</strong>
            <span>{[task.dose, task.doseUnit, task.route].filter((value) => value !== undefined && value !== "").join(" · ") || (task.kind === "medication" ? "Medicamento" : "Tarea no farmacológica")}</span>
            {task.creator && <small>Registrada por {task.creator}</small>}
          </div>
          <span className={`ipd-task-status ipd-task-status-${task.status}`}><i className={statusIcons[task.status]} aria-hidden="true" />{statusLabels[task.status]}</span>
          <Button outlined size="small" icon="pi pi-pencil" label="Gestionar" disabled={!canManage(task)} title={!canManage(task) ? "La tarea no puede modificarse en este turno o requiere otro privilegio." : undefined} onClick={() => onManage(task)} />
        </div>)}
      </div>
    </article>)}
  </div>;
}

function NursingTaskLegend() {
  const statuses: CareTask["status"][] = ["pending", "late", "administered", "administered-late", "missed", "stopped"];
  return <div className="ipd-task-legend" aria-label="Leyenda de estados">
    {statuses.map((status) => <span className={`ipd-task-legend-${status}`} key={status}><i className={statusIcons[status]} aria-hidden="true" />{statusLabels[status]}</span>)}
  </div>;
}

function DrugChart({ tasks, use24Hour }: { tasks: CareTask[]; use24Hour: boolean }) {
  const times = [...new Set(tasks.map((task) => task.scheduledTime))].sort((left, right) => left - right);
  const groups = [...new Set(tasks.map((task) => task.name))];
  return <div className="ipd-task-table-scroll"><table className="ipd-task-table ipd-drug-chart">
    <thead><tr><th>Medicamento</th>{times.map((time) => <th key={time}>{DateTime.fromMillis(time).toFormat(use24Hour ? "HH:mm" : "hh:mm a")}</th>)}</tr></thead>
    <tbody>{groups.map((name) => <tr key={name}><th>{name}</th>{times.map((time) => {
      const task = tasks.find((candidate) => candidate.name === name && candidate.scheduledTime === time);
      return <td key={time}>{task ? <span className={`ipd-task-status ipd-task-status-${task.status}`} title={statusLabels[task.status]}><i className={task.status === "administered" ? "pi pi-check" : task.status === "missed" ? "pi pi-times" : task.status === "stopped" ? "pi pi-stop-circle" : task.status === "late" ? "pi pi-exclamation-triangle" : "pi pi-clock"} /><span>{statusLabels[task.status]}</span></span> : "—"}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}

export function IpdTaskSection({ patientUuid, visitUuid, locationUuid, config, kind, readOnly = false }: Props) {
  const { user, provider } = useAuth();
  const toast = useRef<Toast>(null);
  const liveShift = useMemo(() => currentIpdShift(config.shiftDetails), [config.shiftDetails]);
  const [shift, setShift] = useState<IpdShiftWindow>(liveShift);
  const [filter, setFilter] = useState<NursingTaskFilter>("pending");
  const [selectedTask, setSelectedTask] = useState<CareTask>();
  const [action, setAction] = useState<NursingTaskAction>("complete");
  const [actualTime, setActualTime] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [confirmingMedication, setConfirmingMedication] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const thresholds = kind === "drug-chart" ? config.drugChart : config.nursingTasks;
  const thresholdContract = {
    pastLateMinutes: thresholds.timeInMinutesFromNowToShowPastTaskAsLate,
    administeredLateMinutes: thresholds.timeInMinutesFromStartTimeToShowAdministeredTaskAsLate,
  };
  const medication = useQuery({
    queryKey: ["ipd", "patient-dashboard", kind, "medication", patientUuid, visitUuid, shift.start.toMillis(), shift.end.toMillis()],
    queryFn: () => getPatientMedicationTasks(patientUuid, visitUuid, shift.start.toMillis(), shift.end.toMillis(), thresholdContract, kind === "drug-chart" ? "drugChart" : undefined),
  });
  const nonMedication = useQuery({
    queryKey: ["ipd", "patient-dashboard", kind, "non-medication", patientUuid, visitUuid, shift.start.toMillis(), shift.end.toMillis()],
    queryFn: () => getPatientNonMedicationTasks(patientUuid, visitUuid, shift.start.toMillis(), shift.end.toMillis(), thresholdContract),
    enabled: kind === "nursing",
  });
  const allTasks = useMemo(() => [
    ...(medication.data ?? []),
    ...(kind === "nursing" ? nonMedication.data ?? [] : []),
  ].sort((left, right) => left.scheduledTime - right.scheduledTime || left.name.localeCompare(right.name)), [kind, medication.data, nonMedication.data]);
  const tasks = useMemo(() => kind === "nursing" ? allTasks.filter((task) => matchesNursingTaskFilter(task, filter)) : allTasks, [allTasks, filter, kind]);
  const loading = medication.isLoading || (kind === "nursing" && nonMedication.isLoading);
  const partialFailure = medication.isError || (kind === "nursing" && nonMedication.isError);
  const shiftIsCurrent = sameShift(shift, liveShift);
  const canAddTask = kind === "nursing" && canAddNursingTask({
    readOnly,
    currentShift: shiftIsCurrent,
    canAddNonMedication: hasPrivilege(user, "Add Tasks"),
    canAddAdhocMedication: hasPrivilege(user, "Edit adhoc medication tasks"),
  });

  const reconcile = async () => {
    await Promise.all([medication.refetch(), kind === "nursing" ? nonMedication.refetch() : Promise.resolve()]);
  };

  const updateTask = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No se seleccionó una tarea.");
      if (!provider?.uuid) throw new Error("La sesión no tiene un proveedor clínico asociado.");
      const actualMillis = actualTime.getTime();
      if (actualMillis > Date.now()) throw new Error("La hora efectiva no puede estar en el futuro.");
      const notesRequired = action === "skip" || (selectedTask.kind === "medication" && medicationCompletionNeedsNotes(selectedTask, actualMillis, config.nursingTasks.timeInMinutesFromStartTimeToShowAdministeredTaskAsLate));
      if (notesRequired && !notes.trim()) throw new Error(action === "skip" ? "Debe registrar una nota para omitir la tarea." : "Debe registrar una nota porque la administración está fuera de la ventana configurada.");
      if (selectedTask.kind === "medication") {
        await updateScheduledMedicationAdministrations([buildMedicationAdministration(selectedTask, action, actualMillis, notes, provider.uuid)]);
        await audit(action === "complete" ? "ADMINISTER_MEDICATION_TASK" : "SKIP_SCHEDULED_MEDICATION_TASK", `${action}:${selectedTask.uuid}`, patientUuid, "MODULE_LABEL_IPD_KEY");
      } else {
        const effectiveMillis = action === "complete" && isSystemGeneratedTask(selectedTask) ? Date.now() : actualMillis;
        await updateNonMedicationTasks([buildNonMedicationUpdate(selectedTask, action, effectiveMillis, notes)]);
        await audit(action === "complete" ? "NON_MEDICATION_TASK_COMPLETED" : "SKIP_SCHEDULED_NON_MEDICATION_TASK", `${action}:${selectedTask.uuid}`, patientUuid, "MODULE_LABEL_IPD_KEY");
      }
    },
    onSuccess: async () => {
      await reconcile();
      toast.current?.show({ severity: "success", summary: action === "complete" ? "Tarea completada" : "Tarea omitida", detail: "OpenMRS confirmó el nuevo estado." });
      setSelectedTask(undefined);
      setConfirmingMedication(false);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "OpenMRS no pudo actualizar la tarea.";
      setValidationError(message);
      setConfirmingMedication(false);
      toast.current?.show({ severity: "error", summary: "No se guardó la tarea", detail: message });
    },
  });

  const openTask = (task: CareTask) => {
    setSelectedTask(task);
    setAction("complete");
    setActualTime(new Date());
    setNotes("");
    setValidationError(undefined);
  };

  const canManage = (task: CareTask) => !readOnly
    && shiftIsCurrent
    && !isTaskFinal(task)
    && isTaskRelevant(task, Date.now(), config.nursingTasks.timeInMinutesFromNowToShowTaskAsRelevant ?? 0)
    && hasPrivilege(user, taskRequiredPrivilege(task));

  const requestSave = () => {
    setValidationError(undefined);
    if (selectedTask?.kind === "medication" && action === "complete") setConfirmingMedication(true);
    else updateTask.mutate();
  };

  return <div className="ipd-task-section">
    <Toast ref={toast} position="top-right" />
    <header><div><strong>Turno {shift.label}</strong><span>{shift.start.toFormat("dd LLL yyyy · HH:mm")}–{shift.end.toFormat("dd LLL yyyy · HH:mm")}</span></div><div className="ipd-task-toolbar">
      <Button outlined icon="pi pi-chevron-left" aria-label="Turno anterior" title="Ver turno anterior" onClick={() => setShift((current) => adjacentIpdShift(config.shiftDetails, current, -1))} />
      <Button outlined label="Turno actual" disabled={shiftIsCurrent} onClick={() => setShift(liveShift)} />
      <Button outlined icon="pi pi-chevron-right" aria-label="Turno siguiente" title="Ver turno siguiente (hasta dos dÃ­as)" disabled={!canNavigateToNextIpdShift(shift, liveShift)} onClick={() => setShift((current) => adjacentIpdShift(config.shiftDetails, current, 1))} />
      {kind === "nursing" && <Dropdown aria-label="Filtrar tareas" value={filter} options={filterOptions} onChange={(event) => setFilter(event.value as NursingTaskFilter)} />}
      {kind === "nursing" && <Button className="ipd-add-task-button" icon="pi pi-plus" label="Añadir tarea" disabled={!canAddTask} title={!canAddTask ? readOnly ? "La visita está cerrada y sólo permite consulta." : !shiftIsCurrent ? "Vuelva al turno vigente para crear tareas." : "Requiere Add Tasks o Edit adhoc medication tasks." : undefined} onClick={() => setAddingTask(true)} />}
      <Button text icon="pi pi-refresh" label="Actualizar" loading={medication.isFetching || nonMedication.isFetching} onClick={() => void reconcile()} />
    </div></header>
    {!shiftIsCurrent && <p className="ipd-task-readonly"><i className="pi pi-info-circle" /> Está revisando un turno distinto del vigente. Sus actividades se muestran en modo de consulta.</p>}
    {partialFailure && <p className="warning-banner" role="alert">La vista es parcial: OpenMRS no devolvió uno de los dominios de actividades.</p>}
    {loading && <p role="status" className="muted-text">Cargando actividades del turno…</p>}
    {!loading && tasks.length === 0 && <p className="muted-text">No hay actividades para el turno y filtro seleccionados.</p>}
    {!loading && tasks.length > 0 && (kind === "drug-chart" ? <DrugChart tasks={tasks} use24Hour={config.enable24HourTime} /> : <NursingTaskBoard tasks={tasks} use24Hour={config.enable24HourTime} canManage={canManage} onManage={openTask} />)}
    <NursingTaskLegend />

    <Dialog header="Gestionar tarea de enfermería" visible={Boolean(selectedTask)} modal className="ipd-task-dialog" onHide={() => !updateTask.isPending && setSelectedTask(undefined)} footer={<><Button outlined label="Cancelar" disabled={updateTask.isPending} onClick={() => setSelectedTask(undefined)} /><Button label={action === "complete" ? "Completar" : "Omitir"} severity={action === "skip" ? "danger" : undefined} loading={updateTask.isPending} onClick={requestSave} /></>}>
      {selectedTask && <div className="ipd-task-editor"><div className="ipd-task-editor-summary"><strong>{selectedTask.name}</strong><span>{DateTime.fromMillis(selectedTask.scheduledTime).toFormat(config.enable24HourTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy hh:mm a")}</span><small>{[selectedTask.dose, selectedTask.doseUnit, selectedTask.route].filter(Boolean).join(" · ")}</small></div>
        <label>Resultado<Dropdown value={action} options={[{ label: "Completada", value: "complete" }, { label: "Omitida / no realizada", value: "skip" }]} onChange={(event) => { setAction(event.value as NursingTaskAction); setValidationError(undefined); }} /></label>
        <label>Hora efectiva<Calendar value={actualTime} onChange={(event) => event.value instanceof Date && setActualTime(event.value)} dateFormat="dd/mm/yy" showTime hourFormat={config.enable24HourTime ? "24" : "12"} showIcon maxDate={new Date()} disabled={selectedTask.kind === "non-medication" && isSystemGeneratedTask(selectedTask)} /></label>
        <label>Notas{(action === "skip" || medicationCompletionNeedsNotes(selectedTask, actualTime.getTime(), config.nursingTasks.timeInMinutesFromStartTimeToShowAdministeredTaskAsLate)) && <span aria-hidden="true"> *</span>}<InputTextarea value={notes} autoResize rows={3} maxLength={255} onChange={(event) => { setNotes(event.target.value); setValidationError(undefined); }} /></label>
        {validationError && <p className="field-error" role="alert">{validationError}</p>}
      </div>}
    </Dialog>
    <Dialog header="Confirmar administración" visible={confirmingMedication} modal onHide={() => !updateTask.isPending && setConfirmingMedication(false)} footer={<><Button outlined label="Volver" disabled={updateTask.isPending} onClick={() => setConfirmingMedication(false)} /><Button label="Confirmar" loading={updateTask.isPending} onClick={() => updateTask.mutate()} /></>}><p>Confirme que administró <strong>{selectedTask?.name}</strong> en la hora registrada.</p></Dialog>
    {kind === "nursing" && <IpdAddTaskDialog
      patientUuid={patientUuid}
      locationUuid={locationUuid}
      config={config}
      visible={addingTask}
      onHide={() => setAddingTask(false)}
      onSaved={async (message, scheduledTime) => {
        if (scheduledTime !== undefined) {
          const scheduledShift = shiftForScheduledTask(config.shiftDetails, scheduledTime);
          setShift(scheduledShift);
          setFilter("pending");
          if (sameShift(scheduledShift, shift)) await reconcile();
        } else {
          await reconcile();
        }
        toast.current?.show({ severity: "success", summary: "Tarea creada", detail: message });
      }}
      onError={(message) => toast.current?.show({ severity: "error", summary: "No se creó la tarea", detail: message })}
    />}
  </div>;
}
