import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { SelectButton } from "primereact/selectbutton";
import { useState, type CSSProperties, type ReactNode } from "react";
import { displayName, localDate, object, records, text, toConcept } from "./shared";

type Observation = Record<string, unknown>;
type ConceptSetUi = Record<string, unknown>;

function conceptUuid(value: unknown): string {
  return text(object(value).uuid);
}

function preferredName(value: unknown): string {
  const source = object(value);
  const shortName = records(source.names).find((name) => text(name.conceptNameType).toUpperCase() === "SHORT");
  return displayName(shortName) || displayName(source);
}

function conceptUiConfig(concept: Observation, conceptSetUI: ConceptSetUi): Observation {
  const sourceName = object(concept.name);
  const candidates = [
    text(sourceName.name),
    text(sourceName.display),
    displayName(concept),
    ...records(concept.names).flatMap((name) => [displayName(name), text(name.name), text(name.display)]),
  ].filter(Boolean);
  const configuredName = candidates.find((name) => Object.hasOwn(conceptSetUI, name));
  return configuredName ? object(conceptSetUI[configuredName]) : {};
}

function memberObservation(group: Observation, member: Observation): Observation {
  const uuid = conceptUuid(member);
  return records(group.groupMembers).find((observation) => conceptUuid(observation.concept) === uuid) ?? {
    concept: toConcept(member),
    groupMembers: [],
  };
}

function replaceMember(group: Observation, member: Observation, next: Observation): Observation {
  const uuid = conceptUuid(member);
  const current = records(group.groupMembers);
  const index = current.findIndex((observation) => conceptUuid(observation.concept) === uuid);
  const groupMembers = index < 0 ? [...current, next] : current.map((observation, memberIndex) => memberIndex === index ? next : observation);
  return { ...group, groupMembers };
}

function uniqueAnswers(concept: Observation) {
  const seen = new Set<string>();
  return records(concept.answers).flatMap((answer) => {
    const value = toConcept(answer);
    if (!value?.uuid || seen.has(value.uuid)) return [];
    seen.add(value.uuid);
    return [{ label: preferredName(answer), value }];
  });
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value.includes("T") ? value : `${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateTime(value: Date | null): string {
  if (!value) return "";
  return `${localDate(value)}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
}

function observationHasValue(observation: Observation): boolean {
  const value = observation.value;
  if (value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0)) return true;
  return records(observation.groupMembers).some(observationHasValue);
}

function LeafField({ concept, observation, conceptSetUI, onChange }: { concept: Observation; observation: Observation; conceptSetUI: ConceptSetUi; onChange(value: Observation): void }) {
  const datatype = displayName(concept.datatype) || text(concept.datatype);
  const answers = uniqueAnswers(concept);
  const config = conceptUiConfig(concept, conceptSetUI);
  const value = observation.value;
  const [showComment, setShowComment] = useState(Boolean(text(observation.comment)));
  const setValue = (next: unknown) => onChange({ ...observation, concept: observation.concept ?? toConcept(concept), value: next });
  const setComment = (comment: string) => onChange({ ...observation, concept: observation.concept ?? toConcept(concept), comment });
  const id = `bacteriology-${conceptUuid(concept)}`;
  const label = preferredName(concept);
  const codedUsesDropdown = config.dropdown === true || config.dropDown === true || config.autocomplete === true || config.autoComplete === true;
  const parsedDate = parseDate(value);
  let control: ReactNode;

  if (datatype === "Numeric") {
    control = <InputNumber inputId={id} value={typeof value === "number" ? value : null} useGrouping={false} maxFractionDigits={4} onValueChange={(event) => setValue(event.value)} />;
  } else if (datatype === "Coded" && codedUsesDropdown) {
    control = <Dropdown inputId={id} value={conceptUuid(value) || null} options={answers.map((answer) => ({ label: answer.label, value: answer.value.uuid }))} showClear filter={config.autocomplete === true || config.autoComplete === true} onChange={(event) => setValue(answers.find((answer) => answer.value.uuid === event.value)?.value)} />;
  } else if (datatype === "Coded") {
    control = <SelectButton id={id} className="form2-coded-buttons bacteriology-coded-buttons" style={{ "--form2-coded-columns": Math.max(1, Math.min(3, answers.length)) } as CSSProperties} value={conceptUuid(value) || null} options={answers.map((answer) => ({ label: answer.label, value: answer.value.uuid }))} optionLabel="label" optionValue="value" allowEmpty onChange={(event) => setValue(answers.find((answer) => answer.value.uuid === event.value)?.value)} />;
  } else if (datatype === "Date") {
    control = <Calendar inputId={id} value={parsedDate} dateFormat="dd/mm/yy" showIcon onChange={(event) => setValue(localDate(event.value instanceof Date ? event.value : null))} />;
  } else if (datatype === "Datetime") {
    control = <div className="bacteriology-datetime">
      <Calendar inputId={id} value={parsedDate} dateFormat="dd/mm/yy" showIcon onChange={(event) => {
        const next = event.value instanceof Date ? event.value : null;
        if (next && parsedDate) next.setHours(parsedDate.getHours(), parsedDate.getMinutes(), 0, 0);
        setValue(localDateTime(next));
      }} />
      <input className="p-inputtext p-component" type="time" aria-label={`Hora de ${label}`} value={parsedDate ? `${String(parsedDate.getHours()).padStart(2, "0")}:${String(parsedDate.getMinutes()).padStart(2, "0")}` : ""} onChange={(event) => {
        if (!parsedDate) return;
        const [hours, minutes] = event.target.value.split(":").map(Number);
        const next = new Date(parsedDate);
        next.setHours(hours || 0, minutes || 0, 0, 0);
        setValue(localDateTime(next));
      }} />
    </div>;
  } else if (datatype === "Boolean") {
    control = <SelectButton id={id} className="form2-coded-buttons bacteriology-boolean-buttons" style={{ "--form2-coded-columns": 2 } as CSSProperties} value={typeof value === "boolean" ? value : null} options={[{ label: "Sí", value: true }, { label: "No", value: false }]} optionLabel="label" optionValue="value" allowEmpty onChange={(event) => setValue(event.value)} />;
  } else if (datatype === "Text" && config.conciseText !== true) {
    control = <InputTextarea id={id} autoResize rows={2} value={typeof value === "string" ? value : value == null ? "" : String(value)} onChange={(event) => setValue(event.target.value)} />;
  } else {
    control = <InputText id={id} value={typeof value === "string" ? value : value == null ? "" : String(value)} onChange={(event) => setValue(event.target.value)} />;
  }

  return <div className="field bacteriology-concept-field">
    <label htmlFor={id}>{label}</label>
    <div className="bacteriology-concept-control">{control}{text(concept.units) && <small>{text(concept.units)}</small>}</div>
    <Button type="button" className="bacteriology-comment-toggle" text rounded icon={showComment ? "pi pi-file-edit" : "pi pi-file-plus"} aria-label={`${showComment ? "Ocultar" : "Agregar"} notas de ${label}`} onClick={() => setShowComment((current) => !current)} />
    {showComment && <div className="bacteriology-concept-comment"><label htmlFor={`${id}-notes`}>Notas</label><InputTextarea id={`${id}-notes`} autoResize rows={2} maxLength={255} value={text(observation.comment)} onChange={(event) => setComment(event.target.value)} /></div>}
  </div>;
}

function ConceptFields({ concept, observation, conceptSetUI, onChange, depth, maxDepth, showLegend = true }: { concept: Observation; observation: Observation; conceptSetUI: ConceptSetUi; onChange(value: Observation): void; depth: number; maxDepth: number; showLegend?: boolean }) {
  const members = records(concept.setMembers);
  const [open, setOpen] = useState(observationHasValue(observation));
  if (!members.length || depth >= maxDepth) return <LeafField concept={concept} observation={observation} conceptSetUI={conceptSetUI} onChange={onChange} />;
  const fields = members.map((member) => {
    const current = memberObservation(observation, member);
    return <ConceptFields key={conceptUuid(member)} concept={member} observation={current} conceptSetUI={conceptSetUI} depth={depth + 1} maxDepth={maxDepth} onChange={(next) => onChange(replaceMember(observation, member, next))} />;
  });
  if (!showLegend) return <div className="bacteriology-concept-grid">{fields}</div>;
  if (depth > 0) return <details className="bacteriology-result-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{preferredName(concept)}</summary>
    <div className="bacteriology-concept-grid">{fields}</div>
  </details>;
  return <fieldset className="bacteriology-concept-group"><legend>{preferredName(concept)}</legend><div className="bacteriology-concept-grid">{fields}</div></fieldset>;
}

export function BacteriologyConceptSetEditor({ concept, observations, conceptSetUI = {}, maxDepth = 3, onChange, showTitle = true }: { concept: Observation; observations: Observation[]; conceptSetUI?: ConceptSetUi; maxDepth?: number; onChange(value: Observation[]): void; showTitle?: boolean }) {
  const root = observations[0] ?? { concept: toConcept(concept), groupMembers: [] };
  return <ConceptFields concept={concept} observation={root} conceptSetUI={conceptSetUI} depth={0} maxDepth={maxDepth} showLegend={showTitle} onChange={(next) => onChange([next])} />;
}
