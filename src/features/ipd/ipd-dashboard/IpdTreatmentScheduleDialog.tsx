import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { useTranslation } from "react-i18next";
import type { DrugOrderRow } from "@/features/clinical/drugOrders";
import { audit } from "@/services/bahmni/audit";
import { getEncounterTypeUuid, saveMedicationSchedule, stopScheduledTreatment } from "@/services/bahmni/ipdTreatments";
import type { BahmniProvider } from "@/types/bahmni";
import {
  buildMedicationSchedulePayload,
  createTreatmentScheduleDraft,
  validateTreatmentScheduleDraft,
  type TreatmentScheduleAction,
  type TreatmentScheduleConfig,
  type TreatmentScheduleDraft,
} from "./treatmentSchedule";

interface Props {
  patientUuid: string;
  visitUuid?: string;
  locationUuid?: string;
  currentProvider: BahmniProvider | null;
  order: DrugOrderRow;
  action: TreatmentScheduleAction;
  config: TreatmentScheduleConfig;
  onHide(): void;
  onSaved(): void | Promise<void>;
}

function calendarTime(value: string): Date | null {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const date = new Date();
  date.setHours(hour!, minute!, 0, 0);
  return date;
}

function scheduleTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function calendarDate(value: string | number | undefined): Date | null {
  if (value === undefined || value === "") return null;
  const raw = typeof value === "number" && Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numericValue(value: number | string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ReadonlyDropdown({ inputId, value }: { inputId: string; value: string }) {
  return <Dropdown inputId={inputId} value={value || null} options={value ? [{ label: value, value }] : []} disabled className="w-full" />;
}

function TimeFields({ id, label, values, allowMissed, hourFormat, onChange }: {
  id: string;
  label: string;
  values: string[];
  allowMissed?: boolean;
  hourFormat: "12" | "24";
  onChange(values: string[]): void;
}) {
  if (!values.length) return null;
  return <fieldset className="ipd-treatment-time-group">
    <legend>{label}</legend>
    <div className="grid">{values.map((value, index) => <div className="col-12 sm:col-6 lg:col-3" key={index}>{value || !allowMissed
      ? <label className="ipd-treatment-field" htmlFor={`${id}-${index}`}><span>Horario {index + 1}</span><Calendar inputId={`${id}-${index}`} value={calendarTime(value)} timeOnly hourFormat={hourFormat} showIcon icon={() => <i className="pi pi-clock" />} className="w-full" onChange={(event) => event.value instanceof Date && onChange(values.map((item, itemIndex) => itemIndex === index ? scheduleTime(event.value as Date) : item))} /></label>
      : <span className="ipd-treatment-missed-slot"><i className="pi pi-ban" /> Dosis previa omitida</span>}</div>)}</div>
  </fieldset>;
}

export function IpdTreatmentScheduleDialog({ patientUuid, visitUuid, locationUuid, currentProvider, order, action, config, onHide, onSaved }: Props) {
  const { t } = useTranslation();
  const initialDraft = useMemo(() => createTreatmentScheduleDraft(order, config), [config, order]);
  const [draft, setDraft] = useState<TreatmentScheduleDraft>(initialDraft);
  const [comments, setComments] = useState(order.schedule?.notes ?? "");
  const [stopReason, setStopReason] = useState("");
  const [formError, setFormError] = useState<string>();
  const [confirmClose, setConfirmClose] = useState(false);

  const dirty = action.kind === "stop"
    ? Boolean(stopReason.trim())
    : JSON.stringify(draft) !== JSON.stringify(initialDraft) || comments !== (order.schedule?.notes ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === "stop") {
        if (!stopReason.trim()) throw new Error("Indique el motivo para detener el medicamento.");
        if (!visitUuid || !locationUuid || !currentProvider) throw new Error("Falta el contexto de visita, ubicación o profesional para detener el medicamento.");
        const encounterTypeUuid = await getEncounterTypeUuid("Consultation");
        const now = new Date().toISOString();
        await stopScheduledTreatment({
          patientUuid,
          visitUuid,
          locationUuid,
          visitType: "IPD",
          encounterTypeUuid,
          providers: [{ ...currentProvider }],
          drugOrders: [{
            ...order.raw,
            drugOrder: order.raw,
            action: "DISCONTINUE",
            dateActivated: null,
            dateStopped: now,
            scheduledDate: now,
            previousOrderUuid: order.uuid,
            orderReasonText: stopReason.trim(),
          }],
        });
        await audit("STOP_SCHEDULED_MEDICATION_TASK", `order:${order.uuid}`, patientUuid, "MODULE_LABEL_IPD_KEY").catch(() => undefined);
        return;
      }
      if (!order.providerUuid) throw new Error("La orden no informa el profesional prescriptor requerido para programarla.");
      const validation = validateTreatmentScheduleDraft(draft);
      if (validation) throw new Error(validation);
      const payload = buildMedicationSchedulePayload({ patientUuid, providerUuid: order.providerUuid, order, comments, draft });
      await saveMedicationSchedule(payload, action.kind === "edit" ? "edit" : "create");
      await audit(action.kind === "edit" ? "EDIT_SCHEDULED_MEDICATION_TASK" : "CREATE_SCHEDULED_MEDICATION_TASK", `order:${order.uuid}`, patientUuid, "MODULE_LABEL_IPD_KEY").catch(() => undefined);
    },
    onSuccess: async () => {
      await onSaved();
      onHide();
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "No fue posible guardar la programación."),
  });

  const requestClose = () => {
    if (mutation.isPending) return;
    if (dirty) setConfirmClose(true); else onHide();
  };
  const title = action.kind === "edit"
    ? t("EDIT_DRUG_CHART_HEADER", { defaultValue: "Editar gráfico de medicamentos" })
    : action.kind === "stop"
      ? t("STOP_DRUG", { defaultValue: "Detener medicamento" })
      : t("DRUG_CHART_MODAL_HEADER", { defaultValue: "Añadir al gráfico de medicamentos" });
  const footer = <>
    <Button outlined label={t("DRUG_CHART_MODAL_CANCEL", { defaultValue: "Cancelar" })} disabled={mutation.isPending} onClick={requestClose} />
    <Button label={action.kind === "stop" ? t("STOP_DRUG", { defaultValue: "Detener medicamento" }) : t("DRUG_CHART_MODAL_SAVE", { defaultValue: "Guardar" })} severity={action.kind === "stop" ? "danger" : undefined} loading={mutation.isPending} onClick={() => { setFormError(undefined); mutation.mutate(); }} />
  </>;
  const hourFormat = config.enable24HourTimers ? "24" : "12";

  return <>
    <Dialog header={title} visible modal className="ipd-treatment-schedule-dialog" closable={!mutation.isPending} onHide={requestClose} footer={footer}>
      <div className="ipd-treatment-schedule-form">
        {formError && <p role="alert" className="error-banner">{formError}</p>}
        {action.kind === "stop" ? <>
          <section className="ipd-treatment-schedule-summary"><strong>{order.name}</strong><span>{[order.dose, order.route, order.frequency, order.duration].filter(Boolean).join(" · ")}</span><small>{order.provider}</small></section>
          <p>Esta acción suspenderá la orden y sus tareas pendientes. No se puede revertir desde este dashboard.</p>
          <label>Motivo *<InputTextarea autoResize rows={3} value={stopReason} maxLength={255} onChange={(event) => setStopReason(event.target.value)} /></label>
        </> : <>
          <div className="grid ipd-treatment-readonly">
            <label className="col-12 ipd-treatment-field" htmlFor="treatment-drug-name"><span>Medicamento</span><InputText id="treatment-drug-name" value={order.name} disabled className="w-full" /></label>
            <div className="col-12 md:col-6 grid m-0 p-0">
              <label className="col-6 ipd-treatment-field" htmlFor="treatment-dose"><span>Dosis</span><InputNumber inputId="treatment-dose" value={numericValue(order.doseValue)} disabled useGrouping={false} className="w-full" /></label>
              <label className="col-6 ipd-treatment-field" htmlFor="treatment-dose-unit"><span>Unidad</span><ReadonlyDropdown inputId="treatment-dose-unit" value={order.doseUnit ?? ""} /></label>
            </div>
            <label className="col-12 md:col-6 ipd-treatment-field" htmlFor="treatment-route"><span>Vía</span><ReadonlyDropdown inputId="treatment-route" value={order.route === "—" ? "" : order.route} /></label>
            <div className="col-12 md:col-6 grid m-0 p-0">
              <label className="col-6 ipd-treatment-field" htmlFor="treatment-duration"><span>Duración</span><InputNumber inputId="treatment-duration" value={numericValue(order.durationValue)} disabled useGrouping={false} className="w-full" /></label>
              <label className="col-6 ipd-treatment-field" htmlFor="treatment-duration-unit"><span>Unidad</span><ReadonlyDropdown inputId="treatment-duration-unit" value={order.durationUnit ?? ""} /></label>
            </div>
            <label className="col-12 md:col-6 ipd-treatment-field" htmlFor="treatment-start-date"><span>Fecha de inicio</span><Calendar inputId="treatment-start-date" value={calendarDate(order.scheduledDate ?? order.startDate)} disabled showIcon dateFormat="dd M yy" className="w-full" /></label>
            <label className="col-12 md:col-6 ipd-treatment-field" htmlFor="treatment-frequency"><span>Frecuencia</span><ReadonlyDropdown inputId="treatment-frequency" value={order.frequency === "—" ? "" : order.frequency} /></label>
          </div>
          {draft.kind === "unsupported" && <p role="alert" className="warning-banner">La frecuencia “{order.frequency}” no tiene una estrategia configurada en ipdDashboard/app.json.</p>}
          {draft.kind === "start" && <label className="ipd-treatment-field" htmlFor="treatment-start-time"><span>Hora de inicio *</span><Calendar inputId="treatment-start-time" value={calendarTime(draft.startTime)} timeOnly hourFormat={hourFormat} showIcon icon={() => <i className="pi pi-clock" />} className="w-full" onChange={(event) => event.value instanceof Date && setDraft((current) => ({ ...current, startTime: scheduleTime(event.value as Date) }))} /></label>}
          {draft.kind === "fixed" && <>
            <TimeFields id="first-day-time" label="Horarios del primer día" values={draft.firstDayTimes} allowMissed hourFormat={hourFormat} onChange={(values) => setDraft((current) => ({ ...current, firstDayTimes: values }))} />
            <TimeFields id="daily-time" label="Horarios diarios" values={draft.dailyTimes} hourFormat={hourFormat} onChange={(values) => setDraft((current) => ({ ...current, dailyTimes: values }))} />
            <TimeFields id="last-day-time" label="Horarios del último día" values={draft.remainingDayTimes} hourFormat={hourFormat} onChange={(values) => setDraft((current) => ({ ...current, remainingDayTimes: values }))} />
          </>}
          {draft.kind === "prn" && <p>Se creará una tarea disponible para administrar este medicamento según necesidad.</p>}
          <div className="grid ipd-treatment-readonly">
            <label className="col-12 ipd-treatment-field" htmlFor="treatment-instructions"><span>Indicación</span><InputTextarea id="treatment-instructions" value={order.instructions} disabled autoResize rows={2} className="w-full" /></label>
            <label className="col-12 ipd-treatment-field" htmlFor="treatment-additional-instructions"><span>Indicación adicional</span><InputTextarea id="treatment-additional-instructions" value={order.additionalInstructions} disabled autoResize rows={2} className="w-full" /></label>
            {order.rate !== undefined && <label className="col-12 md:col-6 ipd-treatment-field" htmlFor="treatment-rate"><span>Velocidad (ml/h)</span><InputNumber inputId="treatment-rate" value={numericValue(order.rate)} disabled useGrouping={false} className="w-full" /></label>}
            {order.additives && <label className="col-12 ipd-treatment-field" htmlFor="treatment-additives"><span>Aditivos</span><InputTextarea id="treatment-additives" value={order.additives} disabled autoResize rows={2} className="w-full" /></label>}
            <label className="col-12 ipd-treatment-field" htmlFor="treatment-notes"><span>Notas</span><InputTextarea id="treatment-notes" autoResize rows={3} value={comments} maxLength={255} className="w-full" onChange={(event) => setComments(event.target.value)} /></label>
          </div>
        </>}
      </div>
    </Dialog>
    <Dialog header="Descartar cambios" visible={confirmClose} modal className="ipd-confirm-dialog" onHide={() => setConfirmClose(false)} footer={<><Button outlined label="Seguir editando" onClick={() => setConfirmClose(false)} /><Button severity="danger" label="Descartar" onClick={onHide} /></>}>
      <p>Hay cambios sin guardar. ¿Desea descartarlos?</p>
    </Dialog>
  </>;
}
