import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { InputTextarea } from "primereact/inputtextarea";
import { SelectButton } from "primereact/selectbutton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasPrivilege } from "@/services/bahmni/auth";
import { deleteConsultationDiagnosis, searchDiagnosisConcepts } from "@/services/bahmni/consultation";
import {
  canAddDiagnosisAsCondition,
  conditionName,
  conditionFromDiagnosis,
  conditionsByStatus,
  diagnosisName,
  mergeConsultationCondition,
  primaryDiagnosisFirst,
  qualifyTerminologyConcept,
  type ConditionStatus,
} from "../diagnosisBoard";
import { useConsultation } from "../ConsultationContext";
import type { ConsultationCondition, ConsultationDiagnosis } from "../types";
import { clientId, displayName, localDate, object, toConcept } from "./shared";

const statusOptions: Array<{ labelKey: string; fallback: string; value: ConditionStatus }> = [
  { labelKey: "CONDITION_LIST_ACTIVE", fallback: "Activo", value: "ACTIVE" },
  { labelKey: "CONDITION_LIST_INACTIVE", fallback: "Inactivo", value: "INACTIVE" },
  { labelKey: "CONDITION_LIST_HISTORY_OF", fallback: "Historial de", value: "HISTORY_OF" },
];

function parseLocalDate(value?: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function diagnosisSuggestionTemplate(item: unknown) {
  const suggestion = object(item);
  const matchedName = String(suggestion.matchedName ?? suggestion.conceptName ?? suggestion.name ?? "");
  const conceptName = String(suggestion.conceptName ?? matchedName);
  const code = typeof suggestion.code === "string" ? suggestion.code : undefined;
  return <span className="consultation-diagnosis-suggestion"><strong>{matchedName}</strong>{conceptName !== matchedName && <small>{conceptName}</small>}{code && <small>{code}</small>}</span>;
}

function useTerminologyAutocomplete(locale: string, errorMessage: string) {
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const searchSequence = useRef(0);

  const complete = async (event: AutoCompleteCompleteEvent) => {
    const term = event.query.trim();
    const sequence = ++searchSequence.current;
    setSearchError(undefined);
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const results = await queryClient.fetchQuery({
        queryKey: ["consultation-terminology-search", term, locale],
        queryFn: () => searchDiagnosisConcepts(term, locale),
        staleTime: 60_000,
      });
      if (sequence === searchSequence.current) setSuggestions(results);
    } catch {
      if (sequence === searchSequence.current) {
        setSuggestions([]);
        setSearchError(errorMessage);
      }
    }
  };

  return { suggestions, searchError, complete, clear: () => setSuggestions([]) };
}

export function DiagnosisBoard() {
  const { t } = useTranslation();
  const { context, draft, setDraft, updateDraft } = useConsultation();
  const queryClient = useQueryClient();
  const diagnosisSearch = useTerminologyAutocomplete(context.locale, "No fue posible buscar diagnósticos.");
  const conditionSearch = useTerminologyAutocomplete(context.locale, "No fue posible buscar condiciones.");
  const [diagnosisText, setDiagnosisText] = useState<Record<string, string>>({});
  const [expandedDiagnoses, setExpandedDiagnoses] = useState<Set<string>>(new Set());
  const [condition, setCondition] = useState<ConsultationCondition>(() => emptyCondition());
  const [conditionText, setConditionText] = useState("");
  const [conditionNonCoded, setConditionNonCoded] = useState(false);
  const [conditionNotesOpen, setConditionNotesOpen] = useState(false);
  const [diagnosisNotesOpen, setDiagnosisNotesOpen] = useState<Set<string>>(new Set());
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const label = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };
  const translatedStatuses = statusOptions.map((option) => ({ ...option, label: label(option.labelKey, option.fallback) }));
  const today = localDate(new Date());
  const isRetrospective = context.mode === "retrospective";

  const currentDiagnoses = useMemo(() => primaryDiagnosisFirst(draft.diagnoses.filter((item) => !item.voided && !item.historical && Boolean(item.uuid || item.existingObs))), [draft.diagnoses]);
  const pastDiagnoses = useMemo(() => primaryDiagnosisFirst(draft.diagnoses.filter((item) => !item.voided && item.historical)), [draft.diagnoses]);
  const newDiagnoses = draft.diagnoses.filter((item) => !item.voided && !item.historical && !item.uuid && !item.existingObs);

  useEffect(() => {
    const emptyRows = draft.diagnoses.filter((item) => !item.voided && !item.historical && !item.uuid && !item.existingObs && !item.codedAnswer?.uuid && !item.freeTextAnswer?.trim());
    if (emptyRows.length > 1) {
      const keep = emptyRows[0]!.clientId;
      setDraft((current) => ({ ...current, diagnoses: current.diagnoses.filter((item) => !emptyRows.some((empty) => empty.clientId === item.clientId) || item.clientId === keep) }));
      return;
    }
    if (emptyRows.length === 1) return;
    setDraft((current) => ({
      ...current,
      diagnoses: [...current.diagnoses, { clientId: clientId("diagnosis"), order: "PRIMARY", certainty: "CONFIRMED", dirty: false }],
    }));
  }, [draft.diagnoses, setDraft]);

  const patchDiagnosis = (id: string, patch: Partial<ConsultationDiagnosis>) => updateDraft((current) => ({
    ...current,
    diagnoses: current.diagnoses.map((item) => item.clientId === id ? { ...item, ...patch, dirty: true } : item),
  }), "diagnosis");

  const addDiagnosisToConditions = (diagnosis: ConsultationDiagnosis) => {
    const candidate = conditionFromDiagnosis(diagnosis, clientId("condition"), today);
    const result = mergeConsultationCondition(draft.conditions, candidate, today);
    if (result.error) {
      setMessage({ kind: "error", text: result.error === "already-active" ? label("CONDITION_LIST_ALREADY_EXISTS_AS_ACTIVE", "Ya existe como condición activa") : "La fecha no puede ser anterior al último estado activo." });
      return;
    }
    updateDraft((current) => ({ ...current, conditions: result.conditions }), "diagnosis");
    setMessage({ kind: "success", text: "Diagnóstico añadido como condición." });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteConsultationDiagnosis,
    onSuccess: async (_response, obsUuid) => {
      setDraft((current) => ({ ...current, diagnoses: current.diagnoses.filter((diagnosis) => (diagnosis.existingObs ?? diagnosis.previousObs) !== obsUuid) }));
      await queryClient.invalidateQueries({ queryKey: ["clinical-diagnoses", context.patientUuid] });
      setMessage({ kind: "success", text: label("DELETED_MESSAGE", "Diagnóstico eliminado.") });
    },
    onError: (error) => setMessage({ kind: "error", text: error instanceof Error ? error.message : "No fue posible eliminar el diagnóstico." }),
  });

  const removeDiagnosis = (diagnosis: ConsultationDiagnosis) => {
    const obsUuid = diagnosis.existingObs ?? diagnosis.previousObs;
    if (!obsUuid) {
      patchDiagnosis(diagnosis.clientId, { voided: true });
      return;
    }
    if (window.confirm("¿Seguro que desea eliminar este diagnóstico?")) deleteMutation.mutate(obsUuid);
  };

  const addCondition = () => {
    const candidate = condition.concept?.uuid
      ? { ...condition, conditionNonCoded: undefined }
      : conditionNonCoded && conditionText.trim()
        ? { ...condition, concept: undefined, conditionNonCoded: conditionText.trim() }
        : undefined;
    if (!candidate?.status) {
      setMessage({ kind: "error", text: "La condición requiere concepto o texto libre aceptado y un estado." });
      return;
    }
    const result = mergeConsultationCondition(draft.conditions, candidate, today);
    if (result.error) {
      setMessage({ kind: "error", text: result.error === "already-active" ? label("CONDITION_LIST_ALREADY_EXISTS_AS_ACTIVE", "Ya existe como condición activa") : "La fecha no puede ser anterior al último estado activo." });
      return;
    }
    updateDraft((current) => ({ ...current, conditions: result.conditions }), "diagnosis");
    if (candidate.status === "INACTIVE") setInactiveExpanded(true);
    setCondition(emptyCondition());
    setConditionText("");
    setConditionNonCoded(false);
    setConditionNotesOpen(false);
    setMessage(undefined);
  };

  const selectConditionConcept = (value: unknown) => {
    const selected = qualifyTerminologyConcept(toConcept(value));
    setCondition((current) => ({ ...current, concept: selected, conditionNonCoded: undefined }));
    setConditionText(selected ? displayName(selected) : "");
    setConditionNonCoded(false);
  };

  const markCondition = (id: string, status: "HISTORY_OF" | "INACTIVE") => {
    updateDraft((current) => ({
      ...current,
      conditions: current.conditions.map((item) => item.clientId === id ? { ...item, status, onSetDate: today, dirty: true } : item),
    }), "diagnosis");
    if (status === "INACTIVE") setInactiveExpanded(true);
  };

  const addConditionAsFollowUp = (item: ConsultationCondition) => {
    if (!item.uuid || !draft.followUpConditionConcept || item.isFollowUp) return;
    updateDraft((current) => ({
      ...current,
      conditions: current.conditions.map((conditionItem) => conditionItem.clientId === item.clientId ? { ...conditionItem, isFollowUp: true } : conditionItem),
      followUpConditions: [...current.followUpConditions, { concept: { uuid: current.followUpConditionConcept!.uuid }, value: item.uuid, voided: false }],
    }), "diagnosis");
  };

  const toggleDiagnosis = (id: string) => setExpandedDiagnoses((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleDiagnosisNotes = (id: string) => setDiagnosisNotesOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderDiagnosisEditor = (diagnosis: ConsultationDiagnosis, existing = false) => <article className={`consultation-diagnosis-editor${existing ? " existing" : ""}`} key={diagnosis.clientId}>
    {!existing && <div className="field consultation-diagnosis-name"><label htmlFor={`diagnosis-${diagnosis.clientId}`}>{label("CLINICAL_DIAGNOSIS", "Diagnóstico")} *</label>
      <div className="consultation-autocomplete-action"><AutoComplete inputId={`diagnosis-${diagnosis.clientId}`} value={diagnosis.codedAnswer ? displayName(diagnosis.codedAnswer) : diagnosis.freeTextAnswer ?? diagnosis.pendingAnswer ?? diagnosisText[diagnosis.clientId] ?? ""} suggestions={diagnosisSearch.suggestions} completeMethod={diagnosisSearch.complete} field="label" itemTemplate={diagnosisSuggestionTemplate} minLength={2} delay={250} emptyMessage={diagnosisSearch.searchError ?? "No se encontraron diagnósticos."} onChange={(event) => {
        if (typeof event.value === "string") {
          const nextText = event.value;
          setDiagnosisText((current) => ({ ...current, [diagnosis.clientId]: nextText }));
          patchDiagnosis(diagnosis.clientId, diagnosis.freeTextAnswer !== undefined
            ? { codedAnswer: undefined, freeTextAnswer: nextText, pendingAnswer: undefined }
            : { codedAnswer: undefined, freeTextAnswer: undefined, pendingAnswer: nextText });
        } else {
          diagnosisSearch.clear();
          setDiagnosisText((current) => ({ ...current, [diagnosis.clientId]: "" }));
          patchDiagnosis(diagnosis.clientId, { codedAnswer: toConcept(event.value), freeTextAnswer: undefined, pendingAnswer: undefined });
        }
      }} />
        {!context.appConfig.allowOnlyCodedDiagnosis && !diagnosis.codedAnswer?.uuid && <Button type="button" outlined size="small" label={label("CLINICAL_ACCEPT", "Aceptar")} className={diagnosis.freeTextAnswer !== undefined ? "p-button-success" : ""} disabled={!String(diagnosis.pendingAnswer ?? diagnosisText[diagnosis.clientId] ?? diagnosis.freeTextAnswer ?? "").trim()} onClick={() => patchDiagnosis(diagnosis.clientId, { freeTextAnswer: String(diagnosis.pendingAnswer ?? diagnosisText[diagnosis.clientId] ?? diagnosis.freeTextAnswer ?? "").trim(), pendingAnswer: undefined })} />}
      </div>
    </div>}
    <div className="field"><span className="field-label" id={`order-${diagnosis.clientId}`}>{label("CLINICAL_ORDER", "Orden")}</span><SelectButton aria-labelledby={`order-${diagnosis.clientId}`} value={diagnosis.order} options={[{ label: label("CLINICAL_DIAGNOSIS_ORDER_PRIMARY", "Primario"), value: "PRIMARY" }, { label: label("CLINICAL_DIAGNOSIS_ORDER_SECONDARY", "Secundario"), value: "SECONDARY" }]} optionLabel="label" optionValue="value" allowEmpty={false} onChange={(event) => patchDiagnosis(diagnosis.clientId, { order: event.value as ConsultationDiagnosis["order"] })} /></div>
    <div className="field"><span className="field-label" id={`certainty-${diagnosis.clientId}`}>{label("CLINICAL_CERTAINTY", "Certeza")}</span><SelectButton aria-labelledby={`certainty-${diagnosis.clientId}`} value={diagnosis.certainty} options={[{ label: label("CLINICAL_DIAGNOSIS_CERTAINTY_CONFIRMED", "Confirmado"), value: "CONFIRMED" }, { label: label("CLINICAL_DIAGNOSIS_CERTAINTY_PRESUMED", "Sospechado"), value: "PRESUMED" }]} optionLabel="label" optionValue="value" allowEmpty={false} onChange={(event) => patchDiagnosis(diagnosis.clientId, { certainty: event.value as ConsultationDiagnosis["certainty"] })} /></div>
    <div className="field"><span className="field-label">{label("CLINICAL_STATUS", "Estado")}</span><Button type="button" size="small" outlined={!diagnosis.diagnosisStatusConcept} aria-pressed={Boolean(diagnosis.diagnosisStatusConcept)} label={context.appConfig.diagnosisStatus} onClick={() => patchDiagnosis(diagnosis.clientId, { diagnosisStatusConcept: diagnosis.diagnosisStatusConcept ? undefined : { name: "Ruled Out Diagnosis" } })} /></div>
    <div className="consultation-diagnosis-editor-actions"><Button type="button" text icon={diagnosisNotesOpen.has(diagnosis.clientId) ? "pi pi-file-edit" : "pi pi-file-plus"} aria-label={diagnosisNotesOpen.has(diagnosis.clientId) ? "Ocultar comentarios" : "Añadir comentarios"} aria-expanded={diagnosisNotesOpen.has(diagnosis.clientId)} onClick={() => toggleDiagnosisNotes(diagnosis.clientId)} />{!existing && Boolean(diagnosis.codedAnswer?.uuid || diagnosis.freeTextAnswer?.trim() || diagnosis.pendingAnswer?.trim()) && <Button text severity="danger" icon="pi pi-trash" aria-label="Eliminar diagnóstico" onClick={() => removeDiagnosis(diagnosis)} />}</div>
    {diagnosisNotesOpen.has(diagnosis.clientId) && <div className="field consultation-diagnosis-comments"><label htmlFor={`comments-${diagnosis.clientId}`}>Comentarios</label><InputTextarea id={`comments-${diagnosis.clientId}`} autoResize maxLength={255} value={diagnosis.comments ?? ""} onChange={(event) => patchDiagnosis(diagnosis.clientId, { comments: event.target.value })} /></div>}
  </article>;

  const renderDiagnosisHistory = (diagnosis: ConsultationDiagnosis) => {
    const expanded = expandedDiagnoses.has(diagnosis.clientId);
    const provider = diagnosis.providers?.[0]?.name ?? diagnosis.providers?.[0]?.display ?? diagnosis.creatorName;
    return <article className="consultation-diagnosis-history-row" key={diagnosis.clientId}>
      <div className="consultation-diagnosis-history-main">
        <button type="button" className="consultation-record-toggle" aria-expanded={expanded} onClick={() => toggleDiagnosis(diagnosis.clientId)}><i className={`pi pi-angle-${expanded ? "down" : "right"}`} /><strong>{diagnosisName(diagnosis)}</strong></button>
        <span>{diagnosis.firstDiagnosis && <><small>{label("CLINICAL_INITIAL", "Inicial")}</small>{diagnosisSummary(diagnosis.firstDiagnosis, context.locale, context.timeZone, label)}</>}</span>
        <span><small>{label("CLINICAL_CURRENT", "Actual")}</small>{diagnosisSummary(diagnosis, context.locale, context.timeZone, label)}{provider && <em>{provider}</em>}</span>
        <div className="consultation-record-actions">
          {!isRetrospective && !context.appConfig.hideConditions && <Button text size="small" label={label("CLINICAL_ADD_AS_CONDITION", "Añadir como condición")} disabled={!canAddDiagnosisAsCondition(diagnosis, draft.conditions)} onClick={() => addDiagnosisToConditions(diagnosis)} />}
          <Button text size="small" icon="pi pi-pencil" aria-label={`Editar ${diagnosisName(diagnosis)}`} onClick={() => toggleDiagnosis(diagnosis.clientId)} />
          {hasPrivilege(context.user, "app:clinical:deleteDiagnosis") && <Button text size="small" severity="danger" icon="pi pi-times" aria-label={`Eliminar ${diagnosisName(diagnosis)}`} loading={deleteMutation.isPending} onClick={() => removeDiagnosis(diagnosis)} />}
        </div>
      </div>
      {expanded && renderDiagnosisEditor(diagnosis, true)}
    </article>;
  };

  const renderCondition = (item: ConsultationCondition) => <article className="consultation-condition-row" key={item.clientId}>
    <div><strong>{conditionName(item)}</strong>{item.activeSince && <small>{label("CONDITION_LIST_ACTIVE_SINCE", "condición de")} {formatDate(item.activeSince, context.locale, context.timeZone)}</small>}{item.creator && <small>{label("CONDITION_LIST_CREATED_BY", "por")} {item.creator}</small>}</div>
    <div><small className="mobile-only">{label("CONDITION_LIST_NOTES", "Notas")}</small><span>{item.additionalDetail || "—"}</span></div>
    {item.status === "ACTIVE" && <div className="consultation-condition-actions">
      {item.uuid && draft.followUpConditionConcept && <Button text size="small" label={label("CONDITION_LIST_FOLLOW_UP", "Seguimiento")} icon={item.isFollowUp ? "pi pi-check" : undefined} disabled={item.isFollowUp || isRetrospective} onClick={() => addConditionAsFollowUp(item)} />}
      <Button text size="small" label={label("CONDITION_LIST_SET_AS_HISTORY_OF", "Historial de")} disabled={isRetrospective} onClick={() => markCondition(item.clientId, "HISTORY_OF")} />
      <Button text size="small" label={label("CONDITION_LIST_SET_AS_INACTIVE", "Inactivo")} disabled={isRetrospective} onClick={() => markCondition(item.clientId, "INACTIVE")} />
    </div>}
  </article>;

  const activeConditions = conditionsByStatus(draft.conditions, "ACTIVE");
  const historyConditions = conditionsByStatus(draft.conditions, "HISTORY_OF");
  const inactiveConditions = conditionsByStatus(draft.conditions, "INACTIVE");

  return <div className="consultation-board-stack diagnosis-board">
    {message && <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "error-banner" : "success-banner"}>{message.text}</p>}
    <section className="consultation-subsection diagnosis-entry-section"><header><h2>{label("CLINICAL_DIAGNOSIS", "Diagnósticos")}</h2></header>
      {newDiagnoses.map((diagnosis) => renderDiagnosisEditor(diagnosis))}
    </section>

    {currentDiagnoses.length > 0 && <section className="consultation-record-section"><h2>{label("CLINICAL_CURRENT", "Actual")}</h2>{currentDiagnoses.map(renderDiagnosisHistory)}</section>}
    {pastDiagnoses.length > 0 && <details className="consultation-record-section consultation-past-diagnoses"><summary><span>{label("CLINICAL_PAST_DIAGNOSIS", "Diagnósticos anteriores")}</span><span>{label("CLINICAL_INITIAL", "Inicial")}</span><span>{label("CLINICAL_CURRENT", "Actual")}</span></summary>{pastDiagnoses.map(renderDiagnosisHistory)}</details>}

    {!context.appConfig.hideConditions && <section className={`consultation-conditions${isRetrospective ? " retrospective" : ""}`}>
      {isRetrospective && <p role="note" className="info-banner"><i className="pi pi-info-circle" /> {label("CONDITION_LIST_NO_RETRO_MODE", "Las condiciones no pueden ser editadas en modo retroactivo")}</p>}
      <div className="consultation-condition-entry">
        <div className="field"><label htmlFor="new-condition">{label("CONDITION_LIST_CONDITION", "Condición")}</label><div className="consultation-autocomplete-action"><AutoComplete inputId="new-condition" value={condition.concept ? displayName(condition.concept) : conditionText} suggestions={conditionSearch.suggestions} completeMethod={conditionSearch.complete} field="label" itemTemplate={(item) => <span className="consultation-condition-suggestion-select" onMouseDown={(event) => { event.preventDefault(); selectConditionConcept(item); }}>{diagnosisSuggestionTemplate(item)}</span>} minLength={2} delay={250} emptyMessage={conditionSearch.searchError ?? "No se encontraron condiciones."} disabled={isRetrospective} onSelect={(event) => selectConditionConcept(event.value)} onChange={(event) => {
          if (typeof event.value === "string") {
            const nextText = event.value;
            setConditionText(nextText);
            setCondition((current) => ({ ...current, concept: undefined, conditionNonCoded: conditionNonCoded ? nextText : undefined }));
          }
        }} /><Button type="button" outlined size="small" label={label("CLINICAL_ACCEPT", "Aceptar")} className={conditionNonCoded ? "p-button-success" : ""} disabled={isRetrospective || Boolean(condition.concept?.uuid) || !conditionText.trim()} onClick={() => { setConditionNonCoded((value) => !value); setCondition((current) => ({ ...current, conditionNonCoded: conditionNonCoded ? undefined : conditionText.trim() })); }} /></div></div>
        <div className="field"><span className="field-label" id="new-condition-status">{label("CONDITION_LIST_STATUS", "Estado")}</span><SelectButton aria-labelledby="new-condition-status" value={condition.status} options={translatedStatuses} optionLabel="label" optionValue="value" allowEmpty={false} disabled={isRetrospective} onChange={(event) => setCondition((current) => ({ ...current, status: event.value as ConditionStatus }))} /></div>
        <div className="field"><label htmlFor="new-condition-date">{label("CONDITION_LIST_DATE", "Fecha")}</label><div className="consultation-date-note-action"><Calendar inputId="new-condition-date" value={parseLocalDate(condition.onSetDate)} dateFormat="dd/mm/yy" showIcon maxDate={new Date()} disabled={isRetrospective} onChange={(event) => setCondition((current) => ({ ...current, onSetDate: localDate(event.value instanceof Date ? event.value : null) || undefined }))} /><Button type="button" text icon={conditionNotesOpen ? "pi pi-file-edit" : "pi pi-file-plus"} aria-label={conditionNotesOpen ? "Ocultar detalle adicional" : "Añadir detalle adicional"} aria-expanded={conditionNotesOpen} disabled={isRetrospective} onClick={() => setConditionNotesOpen((value) => !value)} /></div></div>
        {conditionNotesOpen && <div className="field consultation-condition-notes"><label htmlFor="new-condition-notes">Detalle adicional</label><InputTextarea id="new-condition-notes" autoResize maxLength={255} value={condition.additionalDetail ?? ""} disabled={isRetrospective} onChange={(event) => setCondition((current) => ({ ...current, additionalDetail: event.target.value }))} /></div>}
        <Button className="consultation-condition-add" icon="pi pi-plus" label={label("CONDITION_LIST_ADD", "Agregar")} disabled={isRetrospective || !condition.status || (!condition.concept?.uuid && !(conditionNonCoded && conditionText.trim()))} onClick={addCondition} />
      </div>

      {draft.conditions.some((item) => !item.voided) && <div className="consultation-condition-lists">
        <section><header><h2>{label("CONDITION_LIST_CONDITIONS_ACTIVE", "Condiciones activas")}</h2><span>{label("CONDITION_LIST_NOTES", "Notas")}</span></header>{activeConditions.length ? activeConditions.map(renderCondition) : <p className="empty-state">{label("CONDITION_LIST_NO_CONDITIONS", "No hay condiciones disponibles")}</p>}</section>
        <section><header><h2>{label("CONDITION_LIST_CONDITIONS_HISTORY_OF", "Historial de condiciones")}</h2><span>{label("CONDITION_LIST_NOTES", "Notas")}</span></header>{historyConditions.length ? historyConditions.map(renderCondition) : <p className="empty-state">{label("CONDITION_LIST_NO_CONDITIONS", "No hay condiciones disponibles")}</p>}</section>
        <details open={inactiveExpanded} onToggle={(event) => setInactiveExpanded(event.currentTarget.open)}><summary><span>{label("CONDITION_LIST_CONDITIONS_INACTIVE", "Condiciones inactivas")}</span><span>{label("CONDITION_LIST_NOTES", "Notas")}</span></summary>{inactiveConditions.length ? inactiveConditions.map(renderCondition) : <p className="empty-state">{label("CONDITION_LIST_NO_CONDITIONS", "No hay condiciones disponibles")}</p>}</details>
      </div>}
    </section>}
  </div>;
}

function emptyCondition(): ConsultationCondition {
  return { clientId: clientId("condition-new"), status: "ACTIVE" };
}

function formatDate(value: string | number, locale: string, timeZone: string): string {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale || "es", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(date);
}

function diagnosisSummary(diagnosis: ConsultationDiagnosis, locale: string, timeZone: string, label: (key: string, fallback: string) => string) {
  const certainty = label(`CLINICAL_DIAGNOSIS_CERTAINTY_${diagnosis.certainty}`, diagnosis.certainty);
  const order = label(`CLINICAL_DIAGNOSIS_ORDER_${diagnosis.order}`, diagnosis.order);
  return <><span>{certainty} · {order}{diagnosis.diagnosisStatusConcept ? ` · ${diagnosis.diagnosisStatusConcept.name ?? diagnosis.diagnosisStatusConcept.display ?? ""}` : ""}</span>{diagnosis.diagnosisDateTime && <time>{formatDate(diagnosis.diagnosisDateTime, locale, timeZone)}</time>}</>;
}
