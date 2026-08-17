import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { normalizeDashboardPrograms, type DashboardProgram } from "@/features/clinical/programRecords";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getPatientPrograms } from "@/services/bahmni/clinical";
import { loadAppConfig } from "@/services/bahmni/config";
import { getPatientProfile } from "@/services/bahmni/patients";
import { enrollPatientInProgram, getProgramAttributeTypes, getProgramDefinitions, removePatientProgramState, updatePatientProgram, type ProgramAttributeType, type ProgramDefinition } from "@/services/bahmni/programs";

function displayDate(value: string | number | undefined): string {
  if (!value) return "No registrada";
  if (typeof value === "string") {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function displayAttributeValue(value: string): string {
  // Program attributes may be stored as OpenMRS ISO timestamps even when they
  // represent a date-only field. Preserve ordinary text and identifiers.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{4})?)?$/.test(value)) return value;
  return displayDate(value);
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const objects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
const nameOf = (item: Record<string, unknown>) => text(item.display ?? item.name ?? item.description) || "Sin nombre";
const attributeFormat = (attribute: ProgramAttributeType) => text(attribute.format ?? attribute.datatypeClassname);
const attributeLabel = (attribute: ProgramAttributeType) => text(attribute.description) || text(attribute.name) || "Atributo";
const dateAttribute = (attribute: ProgramAttributeType) => /DateDatatype|AttributableDate/.test(attributeFormat(attribute));
const conceptAttribute = (attribute: ProgramAttributeType) => attributeFormat(attribute) === "org.openmrs.Concept";
const booleanAttribute = (attribute: ProgramAttributeType) => /(?:^java\.lang\.Boolean$|BooleanDatatype$)/.test(attributeFormat(attribute));
const numberAttribute = (attribute: ProgramAttributeType) => /(?:^java\.lang\.(?:Integer|Float)$)/.test(attributeFormat(attribute));
const answersOf = (attribute: ProgramAttributeType) => {
  const concept = object(attribute.concept);
  return Array.isArray(concept.answers) ? concept.answers.map(object) : [];
};
const answerLabel = (answer: Record<string, unknown>) => {
  const names = Array.isArray(answer.names) ? answer.names.map(object) : [];
  const preferred = names.find((name) => text(name.locale) === "es" && ["SHORT", "FULLY_SPECIFIED"].includes(text(name.conceptNameType)));
  return text(preferred?.name ?? object(answer.name).display ?? answer.displayString ?? answer.display ?? answer.description) || "Sin nombre";
};
const answerUuid = (answer: Record<string, unknown>) => text(answer.uuid ?? answer.conceptId);
const programSettings = (config: unknown) => {
  const root = object(config);
  const source = root.config && typeof root.config === "object" ? object(root.config) : root;
  return source.program;
};
const settingFor = (attribute: ProgramAttributeType, config: unknown) => object(object(programSettings(config))[text(attribute.name)]);
const excludedFromProgram = (attribute: ProgramAttributeType, program: ProgramDefinition | undefined, config: unknown) => {
  const excluded = settingFor(attribute, config).excludeFrom;
  return Array.isArray(excluded) && excluded.map(text).includes(text(program?.name));
};
const requiredAttribute = (attribute: ProgramAttributeType, config: unknown) => settingFor(attribute, config).required === true;
export const todayInputDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const inputDate = (value: unknown) => {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? todayInputDate();
};
const rawAttributeValue = (attribute: Record<string, unknown>, type: ProgramAttributeType) => {
  const value = attribute.value;
  if (conceptAttribute(type)) return { conceptUuid: text(object(value).uuid ?? attribute.hydratedObject) };
  return typeof value === "boolean" ? value : text(object(value).uuid ?? value);
};
type ProgramAttributeValue = string | boolean | { conceptUuid: string } | undefined;

/** `false` is a meaningful OpenMRS attribute value, not an empty response. */
export function hasProgramAttributeValue(value: ProgramAttributeValue): boolean {
  if (value === undefined || value === "") return false;
  return typeof value !== "object" || Boolean(value.conceptUuid);
}

function booleanValue(value: ProgramAttributeValue): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function enrollmentAttributePayload(attribute: ProgramAttributeType, value: ProgramAttributeValue) {
  if (!hasProgramAttributeValue(value)) return [];
  if (conceptAttribute(attribute) && typeof value === "object") {
    const selectedAnswer = answersOf(attribute).find((answer) => answerUuid(answer) === value.conceptUuid);
    return selectedAnswer ? [{ attributeType: { uuid: text(attribute.uuid) }, value: answerLabel(selectedAnswer), hydratedObject: value.conceptUuid }] : [];
  }
  return [{ attributeType: { uuid: text(attribute.uuid) }, value: String(value) }];
}

/** Maps only answered attributes; preserves an explicit boolean `false` as "false". */
export function programEnrollmentAttributes(attributes: ProgramAttributeType[], values: Record<string, ProgramAttributeValue>) {
  return attributes.flatMap((attribute) => enrollmentAttributePayload(attribute, values[text(attribute.uuid)]));
}

/**
 * Keeps persisted values intact unless they are explicitly cleared. An optional
 * attribute that was never stored must not be sent back as a voided record.
 */
export function programUpdateAttributes(types: ProgramAttributeType[], rawAttributes: Record<string, unknown>[], values: Record<string, ProgramAttributeValue>): Array<Record<string, unknown>> {
  return types.flatMap<Record<string, unknown>>((type) => {
    const uuid = text(type.uuid);
    const current = rawAttributes.find((attribute) => text(object(attribute.attributeType).uuid) === uuid);
    const hasDraftValue = Object.prototype.hasOwnProperty.call(values, uuid);
    const value = hasDraftValue ? values[uuid] : current ? rawAttributeValue(current, type) : undefined;
    const base = { ...(current?.uuid ? { uuid: text(current.uuid) } : {}), attributeType: { uuid } };
    if (!hasProgramAttributeValue(value)) return current?.uuid ? [{ ...base, voided: true }] : [];
    if (conceptAttribute(type) && typeof value === "object") {
      const answer = answersOf(type).find((item) => answerUuid(item) === value.conceptUuid);
      return [{ ...base, value: answer ? answerLabel(answer) : "", hydratedObject: value.conceptUuid }];
    }
    return [{ ...base, value: String(value) }];
  });
}

function editableProgramAttributeValue(type: ProgramAttributeType, rawAttributes: Record<string, unknown>[], values: Record<string, ProgramAttributeValue>): ProgramAttributeValue {
  const uuid = text(type.uuid);
  if (Object.prototype.hasOwnProperty.call(values, uuid)) return values[uuid];
  const current = rawAttributes.find((attribute) => text(object(attribute.attributeType).uuid) === uuid);
  return current ? rawAttributeValue(current, type) : undefined;
}

/** Required persisted attributes stay valid until the user explicitly clears them. */
export function requiredProgramAttributesComplete(types: ProgramAttributeType[], rawAttributes: Record<string, unknown>[], values: Record<string, ProgramAttributeValue>, config: unknown): boolean {
  return types
    .filter((type) => requiredAttribute(type, config))
    .every((type) => hasProgramAttributeValue(editableProgramAttributeValue(type, rawAttributes, values)));
}

/** Legacy prevents the enrollment date from being after any existing state. */
export function maximumEnrollmentDate(states: Record<string, unknown>[], today = todayInputDate()): string {
  return states.reduce((maximum, state) => {
    const date = text(state.startDate).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return date && date < maximum ? date : maximum;
  }, today);
}

interface ProgramChronologyInput {
  dateEnrolled: string;
  maxEnrollmentDate: string;
  activeStateStartDate?: unknown;
  stateChanged: boolean;
  completing: boolean;
  actionDate?: string;
}

/** Mirrors the date guards in legacy manageProgramController.updatePatientProgram. */
export function programChronologyError(input: ProgramChronologyInput): string | undefined {
  if (!input.dateEnrolled) return "Ingrese la fecha de enrolamiento antes de guardar.";
  if (input.dateEnrolled > input.maxEnrollmentDate) {
    return `La fecha de enrolamiento no puede ser posterior al inicio del estado más antiguo (${displayDate(input.maxEnrollmentDate)}).`;
  }
  const activeStateDate = text(input.activeStateStartDate).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const actionDate = input.actionDate ?? todayInputDate();
  if (input.stateChanged && activeStateDate && actionDate < activeStateDate) {
    return `El nuevo estado no puede comenzar antes del estado vigente (${displayDate(activeStateDate)}).`;
  }
  if (input.completing && activeStateDate && actionDate < activeStateDate) {
    return `El programa no puede finalizar antes del estado vigente (${displayDate(activeStateDate)}).`;
  }
  return undefined;
}

/** Native counterpart of Bahmni's historical-program dashboard URL. */
export function programDashboardUrl(patientUuid: string, program: DashboardProgram): string {
  const query = new URLSearchParams({ enrollment: program.uuid });
  const programUuid = text(object(program.raw.program).uuid);
  if (programUuid) query.set("programUuid", programUuid);
  if (program.dateEnrolled) query.set("dateEnrolled", String(program.dateEnrolled));
  if (program.dateCompleted) query.set("dateCompleted", String(program.dateCompleted));
  // This is rendered as a native anchor rather than through next/link, so it
  // must include Next's configured basePath for the proxy to route it.
  return `/bahmni/clinical/patient/${encodeURIComponent(patientUuid)}/dashboard?${query.toString()}`;
}

function localStartOfDay(date: string): string {
  const local = new Date(`${date}T00:00:00`);
  const minutes = -local.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${date}T00:00:00.000${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

function ProgramEnrollmentPanel({ open, patientUuid, activeProgramUuids, onToggle }: { open: boolean; patientUuid: string; activeProgramUuids: Set<string>; onToggle(): void }) {
  const queryClient = useQueryClient();
  const [programUuid, setProgramUuid] = useState("");
  const [stateUuid, setStateUuid] = useState("");
  const [date, setDate] = useState(() => todayInputDate());
  const [attributes, setAttributes] = useState<Record<string, ProgramAttributeValue>>({});
  const definitions = useQuery({ queryKey: ["program-definitions"], queryFn: getProgramDefinitions, enabled: open });
  const attributeTypes = useQuery({ queryKey: ["program-attribute-types"], queryFn: getProgramAttributeTypes, enabled: open });
  const config = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical"), enabled: open });
  const selected = definitions.data?.find((program) => text(program.uuid) === programUuid);
  const workflows = Array.isArray(selected?.allWorkflows) ? selected.allWorkflows.map(object).filter((workflow) => workflow.retired !== true) : [];
  const states = workflows.flatMap((workflow) => Array.isArray(workflow.states) ? workflow.states.map(object).filter((state) => state.retired !== true) : []);
  const eligible = (definitions.data ?? []).filter((program) => !activeProgramUuids.has(text(program.uuid)));
  const visibleAttributes = (attributeTypes.data ?? []).filter((attribute) => !excludedFromProgram(attribute, selected, config.data));
  const requiredAttributesComplete = requiredProgramAttributesComplete(visibleAttributes, [], attributes, config.data);
  const enroll = useMutation({
    mutationFn: async () => enrollPatientInProgram({ patientUuid, programUuid, dateEnrolled: localStartOfDay(date), stateUuid: stateUuid || undefined, attributes: programEnrollmentAttributes(visibleAttributes, attributes) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["program-enrollments", patientUuid] }); setAttributes({}); onToggle(); },
  });
  const selectedAlreadyActive = programUuid && activeProgramUuids.has(programUuid);
  const canSubmit = Boolean(programUuid && date && requiredAttributesComplete && !selectedAlreadyActive && !enroll.isPending);
  return <section className="program-section program-enrollment-section"><header><h2>Enrolamiento en nuevo tratamiento</h2><Button text label={open ? "Cerrar" : "Abrir"} icon={open ? "pi pi-minus" : "pi pi-plus"} onClick={onToggle} /></header>
    {open && <><div className="form-grid program-enrollment-form">
      <label className="field"><span>Programa</span><select required value={programUuid} onChange={(event) => { setProgramUuid(event.target.value); setStateUuid(""); }}><option value="">Elegir Programa</option>{eligible.map((program) => <option key={text(program.uuid)} value={text(program.uuid)}>{nameOf(program)}</option>)}</select></label>
      {states.length > 0 && <label className="field"><span>Estado del Programa</span><select value={stateUuid} onChange={(event) => setStateUuid(event.target.value)}><option value="">Elegir estado del Programa</option>{states.map((state) => <option key={text(state.uuid)} value={text(state.uuid)}>{nameOf(object(state.concept)) || nameOf(state)}</option>)}</select></label>}
      <label className="field"><span>Fecha de inicio *</span><input required type="date" max={todayInputDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {visibleAttributes.map((attribute) => { const uuid = text(attribute.uuid); const answers = answersOf(attribute); const value = attributes[uuid]; const required = requiredAttribute(attribute, config.data); const format = attributeFormat(attribute); return <label className="field" key={uuid}><span>{attributeLabel(attribute)}{required ? " *" : ""}</span>{booleanAttribute(attribute) ? <select required={required} value={booleanValue(value) === undefined ? "" : String(booleanValue(value))} onChange={(event) => setAttributes((current) => ({ ...current, [uuid]: event.target.value === "" ? undefined : event.target.value === "true" }))}><option value="">Seleccionar</option><option value="true">Sí</option><option value="false">No</option></select> : answers.length > 0 ? <select required={required} value={typeof value === "object" ? value.conceptUuid : String(value ?? "")} onChange={(event) => setAttributes((current) => ({ ...current, [uuid]: conceptAttribute(attribute) ? { conceptUuid: event.target.value } : event.target.value }))}><option value=""></option>{answers.map((answer) => <option key={answerUuid(answer)} value={answerUuid(answer)}>{answerLabel(answer)}</option>)}</select> : <input required={required} type={dateAttribute(attribute) ? "date" : numberAttribute(attribute) ? "number" : "text"} step={format === "java.lang.Float" ? "any" : undefined} pattern={format === "org.openmrs.customdatatype.datatype.RegexValidatedTextDatatype" ? text(attribute.datatypeConfig) : undefined} value={String(value ?? "")} onChange={(event) => setAttributes((current) => ({ ...current, [uuid]: event.target.value }))} />}</label>; })}
    </div>
    {selectedAlreadyActive && <p className="error-banner">Paciente ya inscrito en el programa.</p>}{enroll.isError && <p className="error-banner">No fue posible inscribir al paciente. Revise los datos e intente nuevamente.</p>}
    <div className="program-enrollment-actions"><Button outlined label="Cancelar" onClick={onToggle} /><Button label="Enrolar" icon="pi pi-check" loading={enroll.isPending} disabled={!canSubmit} onClick={() => enroll.mutate()} /></div></>}
  </section>;
}

function ProgramStateTimeline({ program }: { program: DashboardProgram }) {
  if (!program.states.length) return null;
  return <section className="program-state-timeline" aria-label="Línea de tiempo de estados"><h4>Línea de tiempo</h4><ol>{program.states.map((state, index) => <li key={`${state.name}:${index}`}><span className="program-timeline-point" aria-hidden="true" /><div><strong>{state.name}</strong><small>{displayDate(state.startDate)}{state.endDate ? ` — ${displayDate(state.endDate)}` : " — vigente"}</small></div></li>)}</ol></section>;
}

function ActiveProgramEditor({ program }: { program: DashboardProgram }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [dateEnrolled, setDateEnrolled] = useState(() => inputDate(program.dateEnrolled));
  const [selectedState, setSelectedState] = useState("");
  const [outcome, setOutcome] = useState("");
  const [confirmRemoveState, setConfirmRemoveState] = useState(false);
  const [attributes, setAttributes] = useState<Record<string, ProgramAttributeValue>>({});
  const definitions = useQuery({ queryKey: ["program-definitions"], queryFn: getProgramDefinitions, enabled: editing });
  const attributeTypes = useQuery({ queryKey: ["program-attribute-types"], queryFn: getProgramAttributeTypes, enabled: editing });
  const config = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical"), enabled: editing });
  const programUuid = text(object(program.raw.program).uuid);
  const definition = definitions.data?.find((item) => text(item.uuid) === programUuid) ?? object(program.raw.program);
  const rawStates = objects(program.raw.states).filter((state) => state.voided !== true);
  const activeState = rawStates.find((state) => state.endDate === null || state.endDate === undefined);
  const maxEnrollmentDate = maximumEnrollmentDate(rawStates);
  const stateOptions = objects(definition.allWorkflows).flatMap((workflow) => objects(workflow.states)).filter((state) => state.retired !== true);
  const outcomes = objects(object(definition.outcomesConcept).setMembers).filter((item) => item.retired !== true);
  const rawAttributes = objects(program.raw.attributes);
  const visibleAttributes = (attributeTypes.data ?? []).filter((attribute) => !excludedFromProgram(attribute, definition, config.data));
  const editorLoading = definitions.isLoading || attributeTypes.isLoading || config.isLoading;
  const requiredAttributesComplete = requiredProgramAttributesComplete(visibleAttributes, rawAttributes, attributes, config.data);
  const actionDate = todayInputDate();
  const stateChanged = Boolean(selectedState && text(object(activeState?.state).uuid) !== selectedState);
  const chronologyError = programChronologyError({ dateEnrolled, maxEnrollmentDate, activeStateStartDate: activeState?.startDate, stateChanged, completing: Boolean(outcome), actionDate });
  const save = useMutation({
    mutationFn: async () => {
      if (chronologyError) throw new Error(chronologyError);
      const states = rawStates.map((state) => ({ ...state }));
      if (stateChanged) states.push({ state: { uuid: selectedState }, startDate: localStartOfDay(actionDate) });
      const mappedAttributes = programUpdateAttributes(visibleAttributes, rawAttributes, attributes);
      await updatePatientProgram(program.uuid, {
        dateEnrolled: localStartOfDay(dateEnrolled), states, dateCompleted: outcome ? localStartOfDay(actionDate) : null,
        outcome: outcome || null, attributes: mappedAttributes,
      });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["program-enrollments"] }); setEditing(false); setSelectedState(""); setOutcome(""); setAttributes({}); },
  });
  const removeState = useMutation({
    mutationFn: async () => {
      const uuid = text(activeState?.uuid);
      if (!uuid) throw new Error("No hay un estado activo para quitar.");
      await removePatientProgramState(program.uuid, uuid);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["program-enrollments"] }); setConfirmRemoveState(false); },
  });
  const beginEdit = () => { setDateEnrolled(inputDate(program.dateEnrolled)); setSelectedState(""); setOutcome(""); setAttributes({}); setEditing(true); };

  return <section className="program-active-management"><div className="program-card-actions">{!editing ? <Button text label="Editar" icon="pi pi-pencil" onClick={beginEdit} /> : <><Button text label="Cancelar" icon="pi pi-times" onClick={() => setEditing(false)} /><Button label={outcome ? "Finalizar programa" : "Guardar cambios"} icon="pi pi-check" loading={save.isPending} disabled={editorLoading || !requiredAttributesComplete || Boolean(chronologyError)} onClick={() => save.mutate()} /></>}</div>
    {editing && <div className="program-editor">{editorLoading && <p role="status" className="muted-text">Cargando atributos configurados…</p>}<div className="form-grid"><label className="field"><span>Fecha de inicio *</span><input required type="date" max={maxEnrollmentDate} value={dateEnrolled} onChange={(event) => setDateEnrolled(event.target.value)} /></label>{stateOptions.length > 0 && <label className="field"><span>Estado del Programa</span><select value={selectedState} onChange={(event) => setSelectedState(event.target.value)}><option value="">Elegir estado del Programa</option>{stateOptions.map((state) => <option key={text(state.uuid)} value={text(state.uuid)}>{nameOf(object(state.concept)) || nameOf(state)}</option>)}</select></label>}{outcomes.length > 0 && <label className="field"><span>Resultado del Programa</span><select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">Elegir Resultado</option>{outcomes.map((item) => <option key={text(item.uuid)} value={text(item.uuid)}>{nameOf(item)}</option>)}</select><small>Elegir un resultado finalizará el programa hoy.</small></label>}{visibleAttributes.map((type) => { const uuid = text(type.uuid); const value = editableProgramAttributeValue(type, rawAttributes, attributes); const answers = answersOf(type); const format = attributeFormat(type); return <label className="field" key={uuid}><span>{attributeLabel(type)}{requiredAttribute(type, config.data) ? " *" : ""}</span>{booleanAttribute(type) ? <select required={requiredAttribute(type, config.data)} value={booleanValue(value) === undefined ? "" : String(booleanValue(value))} onChange={(event) => setAttributes((draft) => ({ ...draft, [uuid]: event.target.value === "" ? undefined : event.target.value === "true" }))}><option value="">Seleccionar</option><option value="true">Sí</option><option value="false">No</option></select> : answers.length > 0 ? <select required={requiredAttribute(type, config.data)} value={typeof value === "object" ? value.conceptUuid : String(value ?? "")} onChange={(event) => setAttributes((draft) => ({ ...draft, [uuid]: conceptAttribute(type) ? { conceptUuid: event.target.value } : event.target.value }))}><option value=""></option>{answers.map((answer) => <option key={answerUuid(answer)} value={answerUuid(answer)}>{answerLabel(answer)}</option>)}</select> : <input required={requiredAttribute(type, config.data)} type={dateAttribute(type) ? "date" : numberAttribute(type) ? "number" : "text"} step={format === "java.lang.Float" ? "any" : undefined} pattern={format === "org.openmrs.customdatatype.datatype.RegexValidatedTextDatatype" ? text(type.datatypeConfig) : undefined} value={String(value ?? "")} onChange={(event) => setAttributes((draft) => ({ ...draft, [uuid]: event.target.value }))} />}</label>; })}</div>{chronologyError && <p role="alert" className="error-banner">{chronologyError}</p>}{save.isError && <p className="error-banner">No fue posible guardar los cambios del programa.</p>}</div>}
    {activeState && <div className="program-state-remove"><span>Estado vigente: <strong>{nameOf(object(object(activeState.state).concept)) || nameOf(object(activeState.state))}</strong></span>{confirmRemoveState ? <span className="program-state-confirm">¿Quitar este estado? <Button text label="Cancelar" onClick={() => setConfirmRemoveState(false)} /><Button severity="danger" label="Confirmar" loading={removeState.isPending} onClick={() => removeState.mutate()} /></span> : <Button text severity="danger" label="Quitar estado" icon="pi pi-trash" onClick={() => setConfirmRemoveState(true)} />}</div>}{removeState.isError && <p className="error-banner">No fue posible quitar el estado actual.</p>}
  </section>;
}

function ProgramVoidAction({ program }: { program: DashboardProgram }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const voidProgram = useMutation({
    mutationFn: async () => updatePatientProgram(program.uuid, {
      dateEnrolled: text(program.raw.dateEnrolled),
      states: objects(program.raw.states),
      dateCompleted: program.raw.dateCompleted ? text(program.raw.dateCompleted) : null,
      outcome: text(object(program.raw.outcome).uuid ?? program.raw.outcome) || null,
      attributes: objects(program.raw.attributes),
      voided: true,
      voidReason: reason.trim(),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["program-enrollments"] }); setOpen(false); setConfirming(false); setReason(""); },
  });
  const close = () => { if (!voidProgram.isPending) { setOpen(false); setConfirming(false); setReason(""); } };
  return <><Button text severity="danger" label="Anular programa" icon="pi pi-ban" onClick={() => setOpen(true)} /><Dialog header="Anular programa" visible={open} modal style={{ width: "min(520px, 94vw)" }} onHide={close} footer={confirming ? <><Button outlined label="Volver" disabled={voidProgram.isPending} onClick={() => setConfirming(false)} /><Button severity="danger" label="Confirmar anulación" icon="pi pi-ban" loading={voidProgram.isPending} onClick={() => voidProgram.mutateAsync()} /></> : <><Button outlined label="Cancelar" onClick={close} /><Button severity="danger" label="Continuar" disabled={!reason.trim()} onClick={() => setConfirming(true)} /></>}><div className="program-void-dialog">{!confirming ? <><p>Se anulará <strong>{program.name}</strong>. Esta acción conserva el registro para auditoría, pero lo quitará de los programas del paciente.</p><label className="field"><span>Motivo de anulación *</span><textarea autoFocus required value={reason} placeholder="Ingrese el motivo de anulación" onChange={(event) => setReason(event.target.value)} /></label></> : <><p>¿Confirma anular <strong>{program.name}</strong>?</p><p className="warning-banner">Motivo: {reason}</p></>}{voidProgram.isError && <p className="error-banner">No fue posible anular el programa. Intente nuevamente.</p>}</div></Dialog></>;
}

function ProgramCard({ program, patientUuid }: { program: DashboardProgram; patientUuid: string }) {
  return <article className={`program-card ${program.active ? "is-active" : ""}`}>
    <header><div><h3>{program.name}</h3><span className={`program-status ${program.active ? "active" : ""}`}>{program.active ? "Activo" : "Finalizado"}</span></div>{program.location && <small><i className="pi pi-map-marker" aria-hidden="true" /> {program.location}</small>}</header>
    <dl className="program-card-details"><div><dt>Fecha de enrolamiento</dt><dd>{displayDate(program.dateEnrolled)}</dd></div>{!program.active && <div><dt>Fecha de término</dt><dd>{displayDate(program.dateCompleted)}</dd></div>}{program.outcome && <div><dt>Resultado</dt><dd>{program.outcome}</dd></div>}</dl>{program.active && <ActiveProgramEditor program={program} />}<div className="program-void-action"><ProgramVoidAction program={program} /></div>
    {(program.attributes.length > 0 || program.states.length > 0) && <details><summary>Ver detalle</summary><div className="program-card-expanded">{program.attributes.length > 0 && <dl>{program.attributes.map((attribute) => <div key={`${attribute.name}:${attribute.value}`}><dt>{attribute.name}</dt><dd>{displayAttributeValue(attribute.value)}</dd></div>)}</dl>}{program.states.length > 0 && <section><h4>Estados</h4><ol>{program.states.map((state, index) => <li key={`${state.name}:${index}`}><strong>{state.name}</strong><span>{displayDate(state.startDate)}{state.endDate ? ` — ${displayDate(state.endDate)}` : " — vigente"}</span></li>)}</ol></section>}<ProgramStateTimeline program={program} /></div></details>}<a className="program-dashboard-link" href={programDashboardUrl(patientUuid, program)}><i className="pi pi-chart-line" aria-hidden="true" /> Abrir dashboard del programa <i className="pi pi-arrow-right" aria-hidden="true" /></a>
  </article>;
}

export function ProgramPatientDetail() {
  useClinicalTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const allowed = hasPrivilege(user, "app:clinical");
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const enrollments = useQuery({ queryKey: ["program-enrollments", patientUuid], queryFn: () => getPatientPrograms(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const patient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const programs = useMemo(() => normalizeDashboardPrograms(enrollments.data ?? []), [enrollments.data]);
  const activePrograms = programs.filter((program) => program.active);
  const pastPrograms = programs.filter((program) => !program.active);
  const loading = profile.isLoading || enrollments.isLoading;
  const [enrolling, setEnrolling] = useState(false);

  return <AuthGuard><AppShell title="Programas">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical requerido para Programas.</p>}
    {allowed && loading && <p role="status">Cargando programas del paciente…</p>}
    {allowed && (profile.isError || enrollments.isError) && <p role="alert" className="error-banner">No fue posible cargar los programas del paciente.</p>}
    {allowed && !loading && patient && <main className="program-patient-workspace">
      <section className="clinical-patient-header panel"><div><span className="clinical-eyebrow">{patient.identifier}</span><h2>{patient.name}</h2><p>{patient.gender || "Sexo no registrado"}{patient.age !== undefined ? ` · ${patient.age} años` : ""}</p></div><div className="toolbar"><Button outlined label="Volver a Programas" icon="pi pi-users" onClick={() => void router.push("/clinical/programs")} /></div></section>
      <section className="program-section"><header><h2>Programas activos</h2><span>{activePrograms.length}</span></header>{activePrograms.length > 0 ? <div className="program-card-grid">{activePrograms.map((program) => <ProgramCard key={program.uuid} program={program} patientUuid={patientUuid} />)}</div> : <p className="program-empty">El paciente no tiene programas activos.</p>}</section>
      <section className="program-section"><header><h2>Programas históricos</h2><span>{pastPrograms.length}</span></header>{pastPrograms.length > 0 ? <div className="program-card-grid">{pastPrograms.map((program) => <ProgramCard key={program.uuid} program={program} patientUuid={patientUuid} />)}</div> : <p className="program-empty">El paciente no tiene programas finalizados.</p>}</section>
      <ProgramEnrollmentPanel open={enrolling} patientUuid={patientUuid} activeProgramUuids={new Set(activePrograms.map((program) => text(object(program.raw.program).uuid)))} onToggle={() => setEnrolling((current) => !current)} />
    </main>}
  </AppShell></AuthGuard>;
}
