import { useMutation, useQuery } from "@tanstack/react-query";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import { useMemo, useRef, useState } from "react";
import { getPatientAllergies } from "@/services/bahmni/clinical";
import {
  calculateDrugDose,
  getActiveMedicationOrders,
  getDrugOrderConfiguration,
  getMedicationStopReasons,
  getOrderSets,
  getPrescribedMedicationOrders,
  searchDrugs,
} from "@/services/bahmni/consultation";
import { mapAllergyIntolerances } from "../../allergies/allergyRecords";
import { useConsultation } from "../ConsultationContext";
import { durationUnitForFrequency } from "../config";
import {
  buildMedicationHistory,
  calculateMedicationQuantity,
  drugSearchOptions,
  formatMedicationDate,
  historyOrderToDraft,
  medicationCatalog,
  type MedicationHistoryOrder,
} from "../medication";
import type { ConsultationDrugOrder } from "../types";
import { clientId, displayName, localDate, object, records, text, toConcept } from "./shared";

function orderTemplate(member: Record<string, unknown>): Record<string, unknown> {
  const raw = member.orderTemplate;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try { return object(JSON.parse(raw)); } catch { return {}; }
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function blankMedication(config: { defaultInstructions: string; defaultDurationUnit: string }): ConsultationDrugOrder {
  return {
    clientId: clientId("drug"),
    instructions: config.defaultInstructions,
    durationUnits: config.defaultDurationUnit,
    effectiveStartDate: localDate(new Date()),
    dirty: true,
  };
}

function hasConfiguredAllergies(sections: Record<string, unknown>): boolean {
  return Object.values(sections).some((section) => object(section).type === "allergies");
}

function orderSummary(order: ConsultationDrugOrder): string {
  return [
    [order.dose, order.doseUnits].filter((value) => value !== undefined && value !== "").join(" "),
    order.frequency,
    [order.duration, order.durationUnits].filter((value) => value !== undefined && value !== "").join(" "),
  ].filter(Boolean).join(" | ");
}

export function TreatmentBoard() {
  const { context, draft, updateDraft } = useConsultation();
  const [editor, setEditor] = useState<ConsultationDrugOrder>(() => blankMedication(context.medicationConfig));
  const [editorError, setEditorError] = useState<string>();
  const [drugSuggestions, setDrugSuggestions] = useState<ReturnType<typeof drugSearchOptions>>([]);
  const [drugSearchError, setDrugSearchError] = useState<string>();
  const drugSearchSequence = useRef(0);
  const [quantityEnteredManually, setQuantityEnteredManually] = useState(false);
  const [quantityUnitEnteredManually, setQuantityUnitEnteredManually] = useState(false);
  const [orderSetQuery, setOrderSetQuery] = useState("");
  const [selectedOrderSet, setSelectedOrderSet] = useState<Record<string, unknown> | null>(null);
  const [selectedHistory, setSelectedHistory] = useState("recent");

  const serverConfig = useQuery({ queryKey: ["consultation-drug-order-configuration"], queryFn: getDrugOrderConfiguration });
  const catalog = useMemo(() => medicationCatalog(serverConfig.data ?? {}, context.medicationConfig), [context.medicationConfig, serverConfig.data]);
  const orderSets = useQuery({ queryKey: ["consultation-order-sets", orderSetQuery], queryFn: () => getOrderSets(orderSetQuery), enabled: !context.medicationConfig.hideOrderSet && orderSetQuery.length >= 2 });
  const stopReasons = useQuery({ queryKey: ["consultation-medication-stop-reasons"], queryFn: getMedicationStopReasons });
  const activeOrders = useQuery({
    queryKey: ["consultation-active-medications", context.patientUuid, context.dateEnrolled, context.dateCompleted],
    queryFn: () => getActiveMedicationOrders({ patientUuid: context.patientUuid, startDate: context.dateEnrolled, endDate: context.dateCompleted }),
  });
  const historyVisits = Number(object(context.medicationConfig.raw.drugOrderHistoryConfig).numberOfVisits) || 3;
  const prescribedOrders = useQuery({
    queryKey: ["consultation-prescribed-medications", context.patientUuid, historyVisits, context.dateEnrolled, context.dateCompleted],
    queryFn: () => getPrescribedMedicationOrders({ patientUuid: context.patientUuid, numberOfVisits: historyVisits, includeActiveVisit: true, startDate: context.dateEnrolled, endDate: context.dateCompleted }),
  });
  const groups = useMemo(() => buildMedicationHistory(activeOrders.data ?? [], prescribedOrders.data ?? [], context.locale), [activeOrders.data, context.locale, prescribedOrders.data]);
  const selectedGroup = groups.find((group) => group.id === selectedHistory) ?? groups[0];
  const treatmentBoard = context.boards.find((board) => board.slug === "treatment");
  const medicationSections = object(treatmentBoard?.extensionParams.sections);
  const allergiesEnabled = hasConfiguredAllergies(medicationSections);
  const allergyQuery = useQuery({ queryKey: ["clinical-dashboard", "allergy", context.patientUuid, context.visit?.uuid], queryFn: () => getPatientAllergies(context.patientUuid), enabled: allergiesEnabled });
  const allergies = useMemo(() => mapAllergyIntolerances(allergyQuery.data ?? []), [allergyQuery.data]);

  const patchDraft = (id: string, value: Partial<ConsultationDrugOrder>) => updateDraft((current) => ({ ...current, drugOrders: current.drugOrders.map((item) => item.clientId === id ? { ...item, ...value, dirty: true } : item) }), "treatment");
  const resetEditor = () => {
    setEditor(blankMedication(context.medicationConfig));
    setEditorError(undefined);
    setQuantityEnteredManually(false);
    setQuantityUnitEnteredManually(false);
  };
  const loadEditor = (value: ConsultationDrugOrder) => {
    setEditor(value);
    setEditorError(undefined);
    setQuantityEnteredManually(false);
    setQuantityUnitEnteredManually(false);
  };
  const edit = (value: Partial<ConsultationDrugOrder>) => setEditor((current) => ({ ...current, ...value, dirty: true }));
  const calculatePosology = (value: ConsultationDrugOrder, manualQuantity = quantityEnteredManually, manualQuantityUnit = quantityUnitEnteredManually): ConsultationDrugOrder => {
    const frequency = catalog.frequencies.find((item) => item.value === value.frequency);
    const automaticDuration = context.medicationConfig.autopopulateDurationBasedOnFrequency.find((item) => item.frequencyName === value.frequency);
    const normalized = automaticDuration ? {
      ...value,
      duration: automaticDuration.duration,
      durationUnits: catalog.durationUnits.includes(automaticDuration.durationUnit) ? automaticDuration.durationUnit : value.durationUnits,
    } : value;
    const durationFactor = context.medicationConfig.durationUnitsFactors.find((item) => item.name === normalized.durationUnits)?.factor ?? 1;
    return {
      ...normalized,
      ...calculateMedicationQuantity({
        dose: normalized.dose,
        doseUnits: normalized.doseUnits,
        frequency: normalized.frequency,
        frequencyPerDay: normalized.frequencyPerDay ?? frequency?.frequencyPerDay,
        duration: normalized.duration,
        durationFactor,
        quantity: normalized.quantity,
        quantityUnits: normalized.quantityUnits,
        quantityEnteredManually: manualQuantity,
        quantityUnitEnteredManually: manualQuantityUnit,
      }),
      dirty: true,
    };
  };
  const editPosology = (value: Partial<ConsultationDrugOrder>) => setEditor((current) => calculatePosology({ ...current, ...value, dirty: true }));
  const completeDrugs = async (event: AutoCompleteCompleteEvent) => {
    const term = event.query.trim();
    const sequence = ++drugSearchSequence.current;
    setDrugSearchError(undefined);
    if (term.length < 2) { setDrugSuggestions([]); return; }
    try {
      const result = drugSearchOptions(await searchDrugs(term), term);
      if (sequence === drugSearchSequence.current) setDrugSuggestions(result);
    } catch {
      if (sequence === drugSearchSequence.current) {
        setDrugSuggestions([]);
        setDrugSearchError("No fue posible cargar el catálogo de medicamentos.");
      }
    }
  };
  const selectDrug = (value: unknown) => {
    if (typeof value === "string") {
      const selectedDrug = value === editor.drugName ? editor.drug : undefined;
      edit({ drug: selectedDrug, drugNonCoded: undefined, drugName: value });
      return;
    }
    const option = object(value);
    const source = Object.keys(object(option.drug)).length ? object(option.drug) : option;
    const dosageForm = displayName(source.dosageForm);
    const defaults = context.medicationConfig.drugFormDefaults[dosageForm] ?? {};
    editPosology({ drug: toConcept(source), drugNonCoded: undefined, drugName: text(source.name) || displayName(source), doseUnits: editor.doseUnits ?? defaults.doseUnits, route: editor.route ?? defaults.route });
  };
  const calculateQuantity = (value: ConsultationDrugOrder): ConsultationDrugOrder => {
    return calculatePosology(value, value.quantity !== undefined && value.quantity !== null, Boolean(value.quantityUnits));
  };
  const calculatedEditor = calculatePosology(editor);
  const commitEditor = () => {
    if (!editor.drug?.uuid && !editor.drugNonCoded?.trim()) { setEditorError(catalog.allowNonCodedDrugs && editor.drugName?.trim() ? "Acepte el nombre libre o seleccione un medicamento del catálogo." : "Seleccione un medicamento del catálogo."); return; }
    if (editor.dose !== undefined && editor.dose !== null && !editor.doseUnits) { setEditorError("Seleccione la unidad de dosis."); return; }
    if (!editor.frequency) { setEditorError("Seleccione la frecuencia."); return; }
    if (!editor.effectiveStartDate) { setEditorError("Ingrese la fecha de inicio."); return; }
    if (!editor.duration || editor.duration < 1 || !editor.durationUnits) { setEditorError("Ingrese una duración válida y su unidad."); return; }
    const editorKey = (editor.drug?.uuid || editor.drugNonCoded || editor.drugName || "").trim().toLocaleLowerCase();
    const pendingConflict = draft.drugOrders.find((order) => order.clientId !== editor.clientId && order.action !== "DISCONTINUE" && (order.drug?.uuid || order.drugNonCoded || order.drugName || "").trim().toLocaleLowerCase() === editorKey);
    const activeConflict = (activeOrders.data ?? []).find((order) => {
      const drug = object(order.drug);
      const key = (text(drug.uuid) || text(order.drugNonCoded) || displayName(drug)).trim().toLocaleLowerCase();
      return key === editorKey && text(order.uuid) !== editor.previousOrderUuid;
    });
    if (pendingConflict || activeConflict) { setEditorError("Ya existe una orden activa o pendiente para este medicamento. Use Revisar o Rellenar desde el historial."); return; }
    const complete = calculatedEditor;
    updateDraft((current) => {
      const exists = current.drugOrders.some((item) => item.clientId === complete.clientId);
      return { ...current, drugOrders: exists ? current.drugOrders.map((item) => item.clientId === complete.clientId ? complete : item) : [...current.drugOrders, complete] };
    }, "treatment");
    resetEditor();
  };
  const pendingOrders = draft.drugOrders.filter((order) => order.dirty);
  const removePending = (id: string) => updateDraft((current) => ({ ...current, drugOrders: current.drugOrders.filter((item) => item.clientId !== id) }), "treatment");
  const addHistorical = (order: MedicationHistoryOrder, action: "NEW" | "REVISE" | "DISCONTINUE") => {
    const converted = historyOrderToDraft(order, action, clientId("drug"), localDate(new Date()));
    if (action === "REVISE") { loadEditor(converted); return; }
    updateDraft((current) => ({ ...current, drugOrders: [...current.drugOrders, converted] }), "treatment");
  };
  const isQueued = (order: MedicationHistoryOrder) => draft.drugOrders.some((item) => item.previousOrderUuid === order.uuid);

  const addOrderSet = useMutation({ mutationFn: async (set: Record<string, unknown>) => Promise.all(records(set.orderSetMembers).map(async (member) => {
    const template = orderTemplate(member);
    const dosing = object(template.dosingInstructions);
    const calculated = await calculateDrugDose({
      patientUuid: context.patientUuid,
      drugName: displayName(template.drug) || displayName(member.concept),
      baseDose: numeric(dosing.dose),
      doseUnit: text(dosing.doseUnits),
      orderSetName: text(set.name),
      dosingRule: text(dosing.dosingRule),
      visitUuid: context.medicationConfig.calculateDoseOnlyOnCurrentVisitValues ? context.visit?.uuid : undefined,
    });
    return calculateQuantity({
      clientId: clientId("drug"), drug: toConcept(template.drug), drugNonCoded: text(template.drugNonCoded) || undefined,
      drugName: displayName(template.drug) || text(template.drugNonCoded) || displayName(member.concept), dose: calculated.dose,
      doseUnits: calculated.doseUnit || text(dosing.doseUnits), route: text(dosing.route), frequency: text(dosing.frequency),
      instructions: text(template.administrationInstructions) || context.medicationConfig.defaultInstructions,
      additionalInstructions: text(template.additionalInstructions), duration: numeric(template.duration),
      durationUnits: text(template.durationUnits) || context.medicationConfig.defaultDurationUnit, quantity: numeric(dosing.quantity),
      quantityUnits: text(dosing.quantityUnits), asNeeded: dosing.asNeeded === true, effectiveStartDate: localDate(new Date()),
      orderSetUuid: text(set.uuid), dosingRule: text(dosing.dosingRule), action: "NEW", dirty: true,
    });
  })), onSuccess: (orders) => {
    updateDraft((current) => ({ ...current, drugOrders: [...current.drugOrders, ...orders] }), "treatment");
    setSelectedOrderSet(null); setOrderSetQuery("");
  }});

  return <div className="medication-workspace">
    <aside className="medication-sidebar">
      <section className="consultation-subsection medication-editor-card">
        <header><h2><i className="pi pi-chevron-down" aria-hidden="true" /> Ordenar medicamento</h2></header>
        {serverConfig.isError && <p className="warning-banner" role="alert">No fue posible cargar los catálogos de medicamentos. Reintente antes de prescribir.</p>}
        <div className="medication-editor-form">
          <div className="field medication-name-field"><label htmlFor="medication-name">Nombre del medicamento *</label><AutoComplete inputId="medication-name" value={editor.drugName ?? editor.drugNonCoded ?? ""} suggestions={drugSuggestions} completeMethod={(event: AutoCompleteCompleteEvent) => void completeDrugs(event)} field="label" minLength={2} delay={250} emptyMessage={drugSearchError ?? "No se encontraron medicamentos."} forceSelection={!catalog.allowNonCodedDrugs} onChange={(event) => { if (typeof event.value === "string") selectDrug(event.value); }} onSelect={(event) => selectDrug(event.value)} />{catalog.allowNonCodedDrugs && editor.drugName && !editor.drug?.uuid && !editor.drugNonCoded && <Button size="small" outlined label="Aceptar" onClick={() => edit({ drugNonCoded: editor.drugName })} />}</div>
          {!catalog.hiddenFields.includes("dose") && <div className="medication-inline"><div className="field"><label htmlFor="medication-dose">Dosis</label><InputNumber inputId="medication-dose" value={editor.dose ?? null} min={0} maxFractionDigits={4} onValueChange={(event) => editPosology({ dose: event.value })} /></div><div className="field"><label htmlFor="medication-dose-unit">Unidades</label><Dropdown inputId="medication-dose-unit" value={editor.doseUnits ?? null} options={catalog.doseUnits} filter onChange={(event) => editPosology({ doseUnits: event.value as string })} /></div></div>}
          <div className="field"><label htmlFor="medication-frequency">Frecuencia *</label><Dropdown inputId="medication-frequency" value={editor.frequency ?? null} options={catalog.frequencies} optionLabel="label" optionValue="value" filter onChange={(event) => { const selected = catalog.frequencies.find((item) => item.value === event.value); editPosology({ frequency: event.value as string, frequencyPerDay: selected?.frequencyPerDay, durationUnits: durationUnitForFrequency(context.medicationConfig, selected?.frequencyPerDay, editor.durationUnits) }); }} /></div>
          <div className="field"><label htmlFor="medication-route">Vía</label><Dropdown inputId="medication-route" value={editor.route ?? null} options={catalog.routes} filter showClear onChange={(event) => edit({ route: event.value as string })} /></div>
          <div className="field"><label htmlFor="medication-start">Fecha de inicio *</label><Calendar inputId="medication-start" value={editor.effectiveStartDate ? new Date(`${editor.effectiveStartDate.slice(0, 10)}T00:00:00`) : null} dateFormat="dd/mm/yy" showIcon onChange={(event) => edit({ effectiveStartDate: localDate(event.value instanceof Date ? event.value : null) })} /></div>
          {!catalog.hiddenFields.includes("duration") && <div className="medication-inline"><div className="field"><label htmlFor="medication-duration">Duración *</label><InputNumber inputId="medication-duration" value={editor.duration ?? null} min={1} useGrouping={false} onValueChange={(event) => editPosology({ duration: event.value })} /></div><div className="field"><label htmlFor="medication-duration-unit">Unidades *</label><Dropdown inputId="medication-duration-unit" value={editor.durationUnits ?? null} options={catalog.durationUnits} onChange={(event) => editPosology({ durationUnits: event.value as string })} /></div></div>}
          {!catalog.hiddenFields.includes("quantity") && <div className="medication-inline"><div className="field" onInputCapture={(event) => { if ((event.target as HTMLInputElement).id === "medication-quantity") setQuantityEnteredManually(true); }}><label htmlFor="medication-quantity">Cantidad total</label><InputNumber inputId="medication-quantity" value={calculatedEditor.quantity ?? null} min={0} maxFractionDigits={4} onValueChange={(event) => edit({ quantity: event.value })} /></div><div className="field"><label htmlFor="medication-quantity-unit">Unidades</label><Dropdown inputId="medication-quantity-unit" value={calculatedEditor.quantityUnits ?? null} options={catalog.dispensingUnits.length ? catalog.dispensingUnits : catalog.doseUnits} filter showClear onChange={(event) => { setQuantityUnitEnteredManually(true); edit({ quantityUnits: event.value as string }); }} /></div></div>}
          <h3>Información adicional</h3>
          <Button type="button" outlined={!editor.asNeeded} label="Cuando sea necesario" icon={editor.asNeeded ? "pi pi-check" : undefined} onClick={() => edit({ asNeeded: !editor.asNeeded })} />
          <div className="field"><label htmlFor="medication-instructions">Instrucciones</label><Dropdown inputId="medication-instructions" editable value={editor.instructions ?? null} options={catalog.dosingInstructions} onChange={(event) => edit({ instructions: event.value as string })} /></div>
          <div className="field"><label htmlFor="medication-additional">Instrucciones adicionales</label><InputTextarea id="medication-additional" autoResize value={editor.additionalInstructions ?? ""} onChange={(event) => edit({ additionalInstructions: event.target.value })} /></div>
          {editor.action === "REVISE" && <Tag severity="info" value="Revisión de una orden existente" />}
          {editorError && <p className="error-banner" role="alert">{editorError}</p>}
          <div className="medication-editor-actions"><Button label={editor.action === "REVISE" ? "Actualizar" : "Añadir"} icon="pi pi-plus" onClick={commitEditor} /><Button outlined severity="secondary" label="Limpiar" onClick={resetEditor} /></div>
        </div>
      </section>

      {!context.medicationConfig.hideOrderSet && <section className="consultation-subsection medication-order-set-card"><header><h2><i className="pi pi-chevron-down" aria-hidden="true" /> Pedir un conjunto de órdenes</h2></header><div className="field"><label htmlFor="medication-set-search">Buscar</label><AutoComplete inputId="medication-set-search" value={selectedOrderSet ?? orderSetQuery} suggestions={orderSets.data ?? []} completeMethod={(event: AutoCompleteCompleteEvent) => setOrderSetQuery(event.query.trim())} field="name" forceSelection minLength={2} delay={250} onChange={(event) => { if (typeof event.value === "string") { setOrderSetQuery(event.value); setSelectedOrderSet(null); } else setSelectedOrderSet(object(event.value)); }} /></div><Button outlined label="Usar set" icon="pi pi-list" loading={addOrderSet.isPending} disabled={!selectedOrderSet || addOrderSet.isPending} onClick={() => selectedOrderSet && addOrderSet.mutate(selectedOrderSet)} />{addOrderSet.isError && <p className="error-banner" role="alert">No fue posible calcular o agregar el set.</p>}</section>}
    </aside>

    <main className="medication-main">
      {allergiesEnabled && <section className="consultation-subsection medication-allergies"><header><h2>Alergias</h2></header>{allergyQuery.isLoading && <p className="empty-state">Cargando alergias…</p>}{allergyQuery.isError && <p className="error-banner" role="alert">No fue posible cargar las alergias.</p>}{allergies.length > 0 && <div className="medication-allergy-table"><strong>Alérgeno</strong><strong>Reacción(es)</strong><strong>Severidad</strong>{allergies.map((allergy) => <div className="medication-allergy-row" key={allergy.id}><span>{allergy.allergen}</span><span>{allergy.reactions.join(", ") || "—"}</span><span>{allergy.severity || "—"}</span></div>)}</div>}{allergyQuery.isSuccess && allergies.length === 0 && <p className="empty-state">No hay alergias registradas.</p>}</section>}

      {pendingOrders.length > 0 && <section className="consultation-subsection medication-pending"><header><h2>Órdenes seleccionadas</h2></header>{pendingOrders.map((order) => order.action === "DISCONTINUE" ? <article className="medication-pending-row medication-stop-row" key={order.clientId}><div><strong>{order.drugName ?? order.drugNonCoded ?? displayName(order.drug)}</strong><small>Se suspenderá al guardar la consulta.</small></div><div className="field"><label>Fecha de suspensión *</label><Calendar value={order.dateStopped ? new Date(`${order.dateStopped.slice(0, 10)}T00:00:00`) : null} minDate={order.effectiveStartDate ? new Date(`${order.effectiveStartDate.slice(0, 10)}T00:00:00`) : undefined} maxDate={new Date()} dateFormat="dd/mm/yy" showIcon onChange={(event) => patchDraft(order.clientId, { dateStopped: localDate(event.value instanceof Date ? event.value : null) })} /></div><div className="field"><label>Motivo *</label><Dropdown value={order.orderReasonConcept?.uuid ?? null} options={(stopReasons.data ?? []).map((reason) => ({ label: displayName(reason), value: String(reason.uuid) }))} showClear onChange={(event) => patchDraft(order.clientId, { orderReasonConcept: toConcept((stopReasons.data ?? []).find((reason) => reason.uuid === event.value)) })} /></div><div className="field"><label>Notas</label><InputTextarea autoResize value={order.orderReasonNonCoded ?? ""} onChange={(event) => patchDraft(order.clientId, { orderReasonNonCoded: event.target.value })} /></div><Button text severity="danger" icon="pi pi-times" aria-label="Cancelar suspensión" onClick={() => removePending(order.clientId)} /></article> : <article className="medication-pending-row" key={order.clientId}><div><strong>{order.drugName ?? order.drugNonCoded ?? displayName(order.drug)}</strong><span>{orderSummary(order)}</span>{order.instructions && <small>{order.instructions}</small>}</div><div className="toolbar"><Tag severity={order.action === "REVISE" ? "info" : "success"} value={order.action === "REVISE" ? "Revisión" : "Nueva"} /><Button outlined icon="pi pi-pencil" aria-label={`Editar ${order.drugName ?? "medicamento"}`} onClick={() => { setEditor(order); setEditorError(undefined); }} /><Button text severity="danger" icon="pi pi-trash" aria-label={`Eliminar ${order.drugName ?? "medicamento"}`} onClick={() => removePending(order.clientId)} /></div></article>)}</section>}

      <section className="consultation-subsection medication-history"><header><div className="medication-history-tabs" role="tablist" aria-label="Historial de medicamentos">{groups.map((group) => <Button key={group.id} text={selectedGroup?.id !== group.id} label={group.label} role="tab" aria-selected={selectedGroup?.id === group.id} onClick={() => setSelectedHistory(group.id)} />)}</div>{selectedGroup?.recent && selectedGroup.orders.length > 0 && <Button label="Rellenar todos" icon="pi pi-replay" disabled={selectedGroup.orders.every(isQueued)} onClick={() => selectedGroup.orders.filter((order) => order.stopDate && !isQueued(order)).forEach((order) => addHistorical(order, "NEW"))} />}</header>
        {(activeOrders.isLoading || prescribedOrders.isLoading) && <p className="empty-state">Cargando tratamientos…</p>}
        {(activeOrders.isError || prescribedOrders.isError) && <p className="error-banner" role="alert">No fue posible cargar el historial completo de medicamentos. Puede reintentar recargando esta vista.</p>}
        {selectedGroup?.orders.map((order) => <article className="medication-history-row" key={`${selectedGroup.id}-${order.uuid}`}><div><strong>{order.name}</strong><span>{[order.dose, order.route, order.frequency, order.duration].filter(Boolean).join(" | ")}</span>{order.instructions && <small>{order.instructions}{order.quantity ? ` | ${order.quantity}` : ""}</small>}</div><div className="medication-history-meta">{order.scheduled ? <Tag className="medication-status medication-status--scheduled" value="Programado" /> : order.active ? <Tag className="medication-status medication-status--active" value="Activo" /> : <Tag className="medication-status medication-status--finished" value="Finalizado" />}<span>{order.startDate ? `Iniciado el ${formatMedicationDate(order.startDate, context.locale)}` : ""}</span><small>{order.provider}</small></div><div className="toolbar"><Button outlined icon="pi pi-pencil" aria-label={`Revisar ${order.name}`} disabled={!order.active || !order.canEdit || isQueued(order)} onClick={() => addHistorical(order, "REVISE")} /><Button outlined severity="danger" icon="pi pi-stop-circle" aria-label={`Suspender ${order.name}`} disabled={!order.active || !order.canDiscontinue || isQueued(order)} onClick={() => addHistorical(order, "DISCONTINUE")} /><Button outlined icon="pi pi-replay" label="Rellenar" disabled={!order.stopDate || order.retired || isQueued(order)} onClick={() => addHistorical(order, "NEW")} /></div></article>)}
        {!activeOrders.isLoading && !prescribedOrders.isLoading && selectedGroup?.orders.length === 0 && <p className="empty-state">No hay tratamientos para este período.</p>}
      </section>
    </main>
  </div>;
}
