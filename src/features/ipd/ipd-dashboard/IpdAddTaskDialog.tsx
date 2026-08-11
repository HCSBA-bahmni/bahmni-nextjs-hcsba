import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputTextarea } from "primereact/inputtextarea";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import type { IpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { audit } from "@/services/bahmni/audit";
import { hasPrivilege } from "@/services/bahmni/auth";
import {
  createAdhocMedicationAdministration,
  createNonMedicationTask,
  ensureIpdTaskEncounter,
  getIpdDrugOrderConfig,
  getIpdTaskProviders,
  searchIpdDrugs,
  type IpdDrugOption,
  type IpdProviderOption,
} from "@/services/bahmni/careView";

interface Props {
  patientUuid: string;
  locationUuid?: string;
  config: IpdDashboardConfig;
  visible: boolean;
  onHide(): void;
  onSaved(message: string, scheduledTime?: number): void | Promise<void>;
  onError(message: string): void;
}

type TaskKind = "medication" | "non-medication";

// OpenMRS persists FHIR task names in fhir_task.name (varchar(255)).
// Legacy used maxCount={10}, but that was only a frontend restriction.
const TASK_NAME_MAX_LENGTH = 255;

function medicationLabel(drug: IpdDrugOption): string {
  return [drug.name, drug.strength, drug.dosageForm].filter(Boolean).join(" · ");
}

export function IpdAddTaskDialog({ patientUuid, locationUuid, config, visible, onHide, onSaved, onError }: Props) {
  const { user, provider } = useAuth();
  const canAddMedication = hasPrivilege(user, "Edit adhoc medication tasks");
  const canAddNonMedication = hasPrivilege(user, "Add Tasks");
  const initialKind: TaskKind = canAddMedication ? "medication" : "non-medication";
  const [kind, setKind] = useState<TaskKind>(initialKind);
  const [drugText, setDrugText] = useState<string | IpdDrugOption>("");
  const [drugSuggestions, setDrugSuggestions] = useState<IpdDrugOption[]>([]);
  const [dose, setDose] = useState<number | null>(null);
  const [doseUnit, setDoseUnit] = useState<string>();
  const [route, setRoute] = useState<string>();
  const [requestedProvider, setRequestedProvider] = useState<IpdProviderOption>();
  const [administrationTime, setAdministrationTime] = useState(new Date());
  const [medicationNotes, setMedicationNotes] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<string>();
  const [scheduledTime, setScheduledTime] = useState(() => new Date(Date.now() + 5 * 60_000));
  const [validationError, setValidationError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const resetForm = () => {
    setKind(canAddMedication ? "medication" : "non-medication");
    setDrugText("");
    setDrugSuggestions([]);
    setDose(null);
    setDoseUnit(undefined);
    setRoute(undefined);
    setRequestedProvider(undefined);
    setAdministrationTime(new Date());
    setMedicationNotes("");
    setTaskName("");
    setTaskType(undefined);
    setScheduledTime(new Date(Date.now() + 5 * 60_000));
    setValidationError(undefined);
    setConfirming(false);
  };

  const hideAndReset = () => {
    if (mutation.isPending) return;
    resetForm();
    onHide();
  };

  const drugConfig = useQuery({
    queryKey: ["ipd", "task-create", "drug-order-config"],
    queryFn: getIpdDrugOrderConfig,
    enabled: visible && canAddMedication,
    staleTime: 10 * 60_000,
  });
  const providers = useQuery({
    queryKey: ["ipd", "task-create", "providers"],
    queryFn: getIpdTaskProviders,
    enabled: visible && canAddMedication,
    staleTime: 10 * 60_000,
  });

  const tabs = useMemo(() => [
    ...(canAddMedication ? [{ label: "Medicamento", value: "medication" as const }] : []),
    ...(canAddNonMedication ? [{ label: "Tarea no farmacológica", value: "non-medication" as const }] : []),
  ], [canAddMedication, canAddNonMedication]);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === kind));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!provider?.uuid) throw new Error("La sesión no tiene un proveedor clínico asociado.");
      if (kind === "medication") {
        if (typeof drugText === "string") throw new Error("Seleccione un medicamento del catálogo.");
        if (!dose || dose <= 0) throw new Error("Ingrese una dosis mayor que cero.");
        if (!doseUnit) throw new Error("Seleccione la unidad de dosis.");
        if (!route) throw new Error("Seleccione la vía de administración.");
        if (!requestedProvider) throw new Error("Seleccione el profesional que indicó el medicamento.");
        if (administrationTime.getTime() > Date.now()) throw new Error("La administración no puede registrarse en el futuro.");
        if (!medicationNotes.trim()) throw new Error("Registre las notas de administración.");
        await createAdhocMedicationAdministration({
          patientUuid,
          drugUuid: drugText.uuid,
          dose,
          doseUnits: doseUnit,
          route,
          providers: [
            { providerUuid: provider.uuid, function: "Performer" },
            { providerUuid: requestedProvider.uuid, function: "Witness" },
          ],
          notes: [{ authorUuid: provider.uuid, text: medicationNotes.trim() }],
          status: "completed",
          administeredDateTime: Math.floor(administrationTime.getTime() / 1_000),
        });
        await audit("CREATE_EMERGENCY_MEDICATION_TASK", "adhoc-medication-created", patientUuid, "MODULE_LABEL_IPD_KEY");
        return "La administración no programada fue registrada.";
      }
      if (!locationUuid) throw new Error("La sesión no tiene una ubicación clínica seleccionada.");
      const normalizedName = taskName.trim();
      if (!normalizedName) throw new Error("Ingrese el nombre de la tarea.");
      if (normalizedName.length > TASK_NAME_MAX_LENGTH) throw new Error(`El nombre de la tarea admite hasta ${TASK_NAME_MAX_LENGTH} caracteres.`);
      if (scheduledTime.getTime() <= Date.now()) throw new Error("La tarea debe programarse para una hora futura.");
      const encounterUuid = await ensureIpdTaskEncounter(patientUuid, locationUuid);
      await createNonMedicationTask({
        name: normalizedName,
        requestedStartTime: scheduledTime.getTime(),
        requestedEndTime: scheduledTime.getTime(),
        patientUuid,
        encounterUuid,
        intent: "ORDER",
        taskType: taskType ?? null,
        status: "REQUESTED",
      });
      await audit("CREATE_NON_MEDICATION_TASK", "non-medication-task-created", patientUuid, "MODULE_LABEL_IPD_KEY");
      return "La tarea de enfermería fue programada.";
    },
    onSuccess: async (message) => {
      setConfirming(false);
      await onSaved(message, kind === "non-medication" ? scheduledTime.getTime() : undefined);
      resetForm();
      onHide();
    },
    onError: (error) => {
      setConfirming(false);
      const message = error instanceof Error ? error.message : "OpenMRS no pudo crear la tarea.";
      setValidationError(message);
      onError(message);
    },
  });

  const searchDrugs = async (event: AutoCompleteCompleteEvent) => {
    try {
      setDrugSuggestions(await searchIpdDrugs(event.query));
    } catch {
      setDrugSuggestions([]);
      onError("No fue posible consultar el catálogo de medicamentos.");
    }
  };

  const requestSave = () => {
    setValidationError(undefined);
    if (kind === "medication") setConfirming(true);
    else mutation.mutate();
  };

  return <>
    <Dialog header="Añadir tarea" visible={visible} modal className="ipd-add-task-dialog" closable={!mutation.isPending} onHide={hideAndReset}
      footer={<><Button outlined label="Cancelar" disabled={mutation.isPending} onClick={hideAndReset} /><Button label={kind === "medication" ? "Registrar administración" : "Programar tarea"} loading={mutation.isPending} onClick={requestSave} /></>}>
      <p className="ipd-dialog-help">Use este formulario para las mismas dos acciones disponibles en legacy: registrar una administración no programada o programar una tarea no farmacológica.</p>
      <TabView activeIndex={activeIndex} onTabChange={(event) => { const selected = tabs[event.index]; if (selected) setKind(selected.value); setValidationError(undefined); }}>
        {canAddMedication && <TabPanel header="Medicamento">
          <div className="ipd-task-create-form">
            <label className="ipd-task-create-wide">Medicamento *<AutoComplete value={drugText} suggestions={drugSuggestions} field="name" completeMethod={(event) => void searchDrugs(event)} itemTemplate={(drug: IpdDrugOption) => medicationLabel(drug)} selectedItemTemplate={(drug: IpdDrugOption) => medicationLabel(drug)} minLength={2} forceSelection dropdown={false} onChange={(event) => setDrugText(event.value as string | IpdDrugOption)} placeholder="Escriba al menos 2 caracteres" /></label>
            <label>Dosis *<InputNumber value={dose} min={0} minFractionDigits={0} maxFractionDigits={3} onValueChange={(event) => setDose(event.value ?? null)} /></label>
            <label>Unidad *<Dropdown value={doseUnit} options={drugConfig.data?.doseUnits ?? []} loading={drugConfig.isLoading} onChange={(event) => setDoseUnit(event.value as string)} placeholder="Seleccione" /></label>
            <label>Vía *<Dropdown value={route} options={drugConfig.data?.routes ?? []} loading={drugConfig.isLoading} onChange={(event) => setRoute(event.value as string)} placeholder="Seleccione" /></label>
            <label>Fecha y hora *<Calendar value={administrationTime} showTime showIcon dateFormat="dd/mm/yy" hourFormat={config.enable24HourTime ? "24" : "12"} maxDate={new Date()} onChange={(event) => event.value instanceof Date && setAdministrationTime(event.value)} /></label>
            <label className="ipd-task-create-wide">Indicado por *<Dropdown value={requestedProvider} options={providers.data ?? []} optionLabel="name" dataKey="uuid" filter loading={providers.isLoading} onChange={(event) => setRequestedProvider(event.value as IpdProviderOption)} placeholder="Seleccione profesional" /></label>
            <label className="ipd-task-create-wide">Notas *<InputTextarea value={medicationNotes} rows={3} autoResize maxLength={255} onChange={(event) => setMedicationNotes(event.target.value)} /></label>
          </div>
        </TabPanel>}
        {canAddNonMedication && <TabPanel header="Tarea no farmacológica">
          <div className="ipd-task-create-form">
            <label>Nombre *<InputText value={taskName} maxLength={TASK_NAME_MAX_LENGTH} onChange={(event) => setTaskName(event.target.value)} /><small>{taskName.length}/{TASK_NAME_MAX_LENGTH}</small></label>
            <label>Tipo<Dropdown value={taskType} options={config.nonMedicationTaskTypes} showClear disabled={!config.nonMedicationTaskTypes.length} onChange={(event) => setTaskType(event.value as string | undefined)} placeholder={config.nonMedicationTaskTypes.length ? "Seleccione" : "Sin tipos configurados"} /></label>
            <label className="ipd-task-create-wide">Fecha y hora programada *<Calendar value={scheduledTime} showTime showIcon dateFormat="dd/mm/yy" hourFormat={config.enable24HourTime ? "24" : "12"} minDate={new Date()} onChange={(event) => event.value instanceof Date && setScheduledTime(event.value)} /></label>
          </div>
        </TabPanel>}
      </TabView>
      {validationError && <p className="field-error" role="alert">{validationError}</p>}
    </Dialog>
    <Dialog header="Confirmar administración" visible={confirming} modal closable={!mutation.isPending} onHide={() => setConfirming(false)}
      footer={<><Button outlined label="Volver" disabled={mutation.isPending} onClick={() => setConfirming(false)} /><Button label="Confirmar" loading={mutation.isPending} onClick={() => mutation.mutate()} /></>}>
      <p>Confirme que desea registrar esta administración no programada. La escritura se enviará una sola vez a OpenMRS.</p>
    </Dialog>
  </>;
}
