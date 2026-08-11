import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { FileUpload, type FileUploadHandlerEvent } from "primereact/fileupload";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { MultiSelect } from "primereact/multiselect";
import { SelectButton } from "primereact/selectbutton";
import { Tooltip } from "primereact/tooltip";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { uploadForm2ComplexFile } from "@/services/bahmni/forms";
import {
  applyKnownFormAdapters,
  buildFormObservations,
  flattenFormControls,
  form2RangeLabel,
  form2RepeatCount,
  form2CodedControlStyle,
  form2ValueKey,
  groupForm2ControlsByRows,
  initialFormAbnormalState,
  initialFormComments,
  initialFormValues,
  isKnownConditionalForm2ControlHidden,
  isForm2ControlHidden,
  isOutsideNormalRange,
  validateForm2Control,
  type Form2AbnormalState,
  type Form2Comments,
  type Form2Control,
  type Form2Definition,
  type Form2Issue,
  type Form2Observation,
  type Form2Values,
} from "./form2";

interface Props {
  definition: Form2Definition;
  observations?: Array<Record<string, unknown>>;
  translations?: Record<string, string>;
  patientUuid?: string;
  sectionDisplay?: { collapsed: boolean; revision: number };
  onChange(observations: Form2Observation[], valid: boolean): void;
  onStateChange?(state: { observations: Form2Observation[]; valid: boolean; values: Form2Values }): void;
}

const pad = (value: number) => String(value).padStart(2, "0");
const stripMarkup = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function answerLabel(answer: NonNullable<Form2Control["concept"]>["answers"][number]): string {
  return answer.displayString ?? (typeof answer.name === "string" ? answer.name : answer.name?.display ?? answer.name?.name) ?? answer.uuid;
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0)) : null;
}

function formatDateValue(value: Date | null | undefined, withTime: boolean): string {
  if (!value) return "";
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return withTime ? `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}` : date;
}

function issueMessage(issue: Form2Issue, control: Form2Control): string {
  if (issue.code === "mandatory") return "Campo obligatorio.";
  if (issue.code === "allowDecimal") return "Este campo sólo acepta números enteros.";
  if (issue.code === "allowFutureDates") return "No se permiten fechas futuras.";
  if (issue.code === "allowRange") return `Fuera del rango normal${form2RangeLabel(control) ? ` (${form2RangeLabel(control)})` : ""}.`;
  const absolute = control.lowAbsolute != null && control.hiAbsolute != null ? `${control.lowAbsolute} - ${control.hiAbsolute}`
    : control.lowAbsolute != null ? `mayor o igual a ${control.lowAbsolute}` : control.hiAbsolute != null ? `menor o igual a ${control.hiAbsolute}` : "configurado";
  return `El valor está fuera del rango permitido (${absolute}).`;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer el archivo."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Formato de archivo no válido."));
    reader.readAsDataURL(file);
  });
}

function ComplexMediaInput({ control, value, patientUuid, inputId, onChange }: {
  control: Form2Control; value: unknown; patientUuid?: string; inputId: string; onChange(value: string): void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const stored = typeof value === "string" ? value : "";
  const voided = stored.endsWith("voided");
  const cleanValue = stored.replace(/voided$/u, "");
  const isVideo = control.concept?.conceptHandler === "VideoUrlHandler";
  const isPdf = cleanValue.toLocaleLowerCase().includes(".pdf");
  const upload = async (event: FileUploadHandlerEvent) => {
    const file = event.files[0];
    if (!file || !patientUuid) return;
    setUploading(true); setError("");
    try {
      const fileType = file.type.includes("pdf") ? "pdf" : file.type.startsWith("video/") || file.type.startsWith("audio/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!fileType || isVideo && fileType !== "video" || !isVideo && fileType === "video") throw new Error("El tipo de archivo no está permitido para este campo.");
      onChange(await uploadForm2ComplexFile({ dataUrl: await fileAsDataUrl(file), patientUuid, fileType }));
      event.options.clear();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar el archivo."); }
    finally { setUploading(false); }
  };
  return <div className={`form2-complex${voided ? " form2-complex-voided" : ""}`}>
    {!cleanValue && <FileUpload id={inputId} mode="basic" name={inputId} auto customUpload accept={isVideo ? ".mkv,.flv,.ogg,video/*,audio/3gpp" : "application/pdf,image/*"} chooseLabel={isVideo ? "Cargar video" : "Cargar imagen o PDF"} chooseOptions={{ icon: isVideo ? "pi pi-video" : "pi pi-cloud-upload" }} disabled={!patientUuid || uploading} uploadHandler={(event) => void upload(event)} />}
    {uploading && <span className="form2-uploading" role="status"><i className="pi pi-spin pi-spinner" /> Cargando archivo…</span>}
    {cleanValue && <div className="form2-media-preview">
      {isVideo ? <video controls preload="metadata" src={`/document_images/${cleanValue}`} />
        : isPdf ? <a href={`/document_images/${cleanValue}`} target="_blank" rel="noreferrer"><i className="pi pi-file-pdf" /><span>Abrir PDF</span></a>
          : <img src={`/document_images/${cleanValue}`} alt={control.label.value || control.concept?.name || "Imagen clínica"} />}
      <Button type="button" rounded outlined severity={voided ? "secondary" : "danger"} icon={voided ? "pi pi-undo" : "pi pi-trash"} aria-label={voided ? "Restaurar archivo" : "Eliminar archivo"} onClick={() => onChange(voided ? cleanValue : `${cleanValue}voided`)} />
    </div>}
    {error && <small className="field-error" role="alert">{error}</small>}
  </div>;
}

export function Form2Renderer({ definition, observations = [], translations = {}, patientUuid, sectionDisplay, onChange, onStateChange }: Props) {
  const initialComments = initialFormComments(definition, observations);
  const [values, setValues] = useState<Form2Values>(() => applyKnownFormAdapters(definition, initialFormValues(definition, observations)));
  const [abnormalState, setAbnormalState] = useState<Form2AbnormalState>(() => initialFormAbnormalState(definition, observations));
  const [comments, setComments] = useState<Form2Comments>(() => initialComments);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(initialComments).filter(([, value]) => Boolean(value)).map(([key]) => [key, true])));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});
  const tooltipTargetClass = `form2-help-${definition.uuid.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const translate = (control: Form2Control) => translations[control.label.translationKey ?? ""] || control.label.value || control.concept?.name || "Campo";
  const update = (control: Form2Control, value: unknown, key: string) => {
    setValues((current) => applyKnownFormAdapters(definition, { ...current, [key]: value }));
    if (control.properties.abnormal) setAbnormalState((current) => ({ ...current, [key]: isOutsideNormalRange(control, value) }));
  };
  const removeRepeat = (control: Form2Control, parentPath: string, index: number, repeatKey: string, count: number) => {
    const prefix = `${parentPath ? `${parentPath}/` : ""}${control.id}-${index}`;
    setValues((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}/`))));
    setComments((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}/`))));
    setAbnormalState((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}/`))));
    setRepeatCounts((current) => ({ ...current, [repeatKey]: Math.max(1, count - 1) }));
  };

  useEffect(() => {
    const controls = flattenFormControls(definition.controls).filter((control) => control.concept && control.type !== "obsGroupControl");
    const valid = controls.every((control) => {
      const entries = Object.entries(values).filter(([key]) => key === control.id || new RegExp(`(?:^|/)${control.id}-\\d+$`).test(key));
      if (!entries.length) return !validateForm2Control(control, undefined).some((issue) => issue.type === "error");
      return entries.every(([, value]) => !validateForm2Control(control, value).some((issue) => issue.type === "error"));
    });
    const nextObservations = buildFormObservations(definition, values, observations, abnormalState, comments);
    onChange(nextObservations, valid); onStateChange?.({ observations: nextObservations, valid, values });
  }, [abnormalState, comments, definition, observations, onChange, onStateChange, values]);

  function renderLayout(controls: Form2Control[], parentPath = ""): ReactNode {
    return <div className="form2-layout">{groupForm2ControlsByRows(controls).map((row) => <div className="form2-row" data-form-row={row.row} key={`${parentPath}:${row.row}`} style={{ "--form2-columns": String(row.columns) } as CSSProperties}>
      {row.controls.map(({ control, column }) => <div className="form2-column" data-form-column={column} key={`${parentPath}:${control.id}`} style={{ gridColumnStart: column + 1 }}>{renderControl(control, parentPath)}</div>)}
    </div>)}</div>;
  }

  function renderControl(control: Form2Control, parentPath = ""): ReactNode {
    if (isForm2ControlHidden(definition, control) || isKnownConditionalForm2ControlHidden(definition, control, values, parentPath) || control.concept?.conceptClass === "Abnormal") return null;
    const repeatKey = `${parentPath}:${control.id}`;
    const count = control.properties.addMore ? repeatCounts[repeatKey] ?? form2RepeatCount(control, parentPath, values, observations) : 1;
    if (!control.properties.addMore) return renderControlInstance(control, parentPath, 0);
    return <div className="form2-repeater">{Array.from({ length: count }, (_, index) => <div className="form2-repeat" key={`${repeatKey}:${index}`}>
      {renderControlInstance(control, parentPath, index)}
      <div className="form2-repeat-actions">
        {index === count - 1 && <Button type="button" rounded outlined size="small" icon="pi pi-plus" aria-label={`Agregar ${translate(control)}`} onClick={() => setRepeatCounts((current) => ({ ...current, [repeatKey]: count + 1 }))} />}
        {index === count - 1 && index > 0 && <Button type="button" rounded outlined size="small" severity="danger" icon="pi pi-trash" aria-label={`Eliminar ${translate(control)}`} onClick={() => removeRepeat(control, parentPath, index, repeatKey, count)} />}
      </div>
    </div>)}</div>;
  }

  function renderControlInstance(control: Form2Control, parentPath: string, index: number): ReactNode {
    const valueKey = form2ValueKey(control.id, parentPath, index);
    const scopedPath = `${parentPath ? `${parentPath}/` : ""}${control.id}-${index}`;
    if (control.type === "section" || control.type === "obsGroupControl") {
      const isGroup = control.type === "obsGroupControl";
      const collapseKey = `${sectionDisplay?.revision ?? 0}:${parentPath}:${control.id}:${index}`;
      const isCollapsed = collapsed[collapseKey] ?? sectionDisplay?.collapsed === true;
      const childPath = isGroup && (parentPath || control.properties.addMore) ? scopedPath : parentPath;
      return <fieldset className={isGroup ? "form2-group" : "form2-section"}>
        <legend><button type="button" className="form2-section-toggle" aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => ({ ...current, [collapseKey]: !isCollapsed }))}><i className={`pi ${isCollapsed ? "pi-angle-right" : "pi-angle-down"}`} />{translate(control)}</button></legend>
        {!isCollapsed && <div className="form2-section-content">{renderLayout(control.controls, childPath)}</div>}
      </fieldset>;
    }
    if (control.type === "label") return <p className="form2-static-label">{translate(control)}</p>;
    if (!control.concept) return <div className="warning-banner">Control no soportado: {control.type}</div>;

    const value = values[valueKey] ?? (index === 0 && !parentPath ? values[control.id] : undefined);
    const issues = validateForm2Control(control, value);
    const error = issues.find((issue) => issue.type === "error");
    const warning = issues.find((issue) => issue.type === "warning");
    const inputClassName = error ? "p-invalid form2-input-error" : warning ? "form2-input-warning" : undefined;
    const datatype = control.concept.datatype.toLowerCase();
    const computed = control.concept.conceptClass === "Computed";
    const id = `form2-${definition.uuid}-${valueKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const options = control.concept.answers.map((answer) => ({ value: answer.uuid, label: translations[answer.translationKey ?? ""] || answerLabel(answer) }));
    const normalRange = form2RangeLabel(control);
    const description = control.concept.description?.value ? stripMarkup(control.concept.description.value) : "";
    const codedControlStyle = datatype === "coded" ? form2CodedControlStyle(control) : undefined;
    const codedButtonColumns = Math.max(1, Math.min(3, options.length));
    const translatedLabel = translate(control);
    const fieldLabel = control.units && !translatedLabel.toLocaleLowerCase().includes(control.units.toLocaleLowerCase()) ? `${translatedLabel} (${control.units})` : translatedLabel;
    return <div className={`field form2-field${computed ? " form2-computed" : ""}${control.properties.sameLine ? " form2-same-line" : ""}`}>
      <div className="form2-label-row"><label htmlFor={id}>{fieldLabel}{control.properties.mandatory && <span className="form2-required"> *</span>}</label>{description && <span className={`form2-help-trigger ${tooltipTargetClass}`} tabIndex={0} role="img" aria-label={`Ayuda para ${fieldLabel}: ${description}`} data-pr-tooltip={description}><i className="pi pi-question-circle" /></span>}</div>
      <div className="form2-control-row"><div className="form2-control-input">
        {datatype === "complex" && (control.concept.conceptHandler === "ImageUrlHandler" || control.concept.conceptHandler === "VideoUrlHandler") ? <ComplexMediaInput control={control} value={value} patientUuid={patientUuid} inputId={id} onChange={(next) => update(control, next, valueKey)} />
          : datatype === "numeric" ? <InputNumber inputId={id} inputClassName={inputClassName} value={typeof value === "number" ? value : value !== undefined && value !== "" ? Number(value) : null} disabled={computed} useGrouping={false} minFractionDigits={0} maxFractionDigits={control.concept.properties?.allowDecimal === false ? 0 : 8} onValueChange={(event) => update(control, event.value ?? "", valueKey)} />
            : codedControlStyle === "multiSelect" ? <MultiSelect inputId={id} className={inputClassName} value={Array.isArray(value) ? value : []} options={options} optionLabel="label" optionValue="value" disabled={computed} filter={options.length > 8} display="chip" onChange={(event) => update(control, event.value ?? [], valueKey)} />
              : codedControlStyle === "buttonSelect" ? <SelectButton id={id} className={`form2-coded-buttons ${inputClassName ?? ""}`} style={{ "--form2-coded-columns": codedButtonColumns } as CSSProperties} value={value ?? null} options={options} optionLabel="label" optionValue="value" disabled={computed} allowEmpty onChange={(event) => update(control, event.value ?? "", valueKey)} />
                : datatype === "coded" ? <Dropdown inputId={id} className={inputClassName} value={value ?? ""} options={options} optionLabel="label" optionValue="value" disabled={computed} showClear filter={codedControlStyle === "autocomplete"} onChange={(event) => update(control, event.value ?? "", valueKey)} />
                  : datatype === "boolean" ? <SelectButton id={id} className={inputClassName} value={value} disabled={computed} options={[{ label: "Sí", value: true }, { label: "No", value: false }]} optionLabel="label" optionValue="value" allowEmpty onChange={(event) => update(control, event.value, valueKey)} />
                    : datatype === "date" || datatype === "datetime" ? <Calendar inputId={id} inputClassName={inputClassName} value={parseDateValue(value)} disabled={computed} dateFormat="dd/mm/yy" showIcon showTime={datatype === "datetime"} hourFormat="24" maxDate={control.properties.allowFutureDates === false ? new Date() : undefined} onChange={(event) => update(control, formatDateValue(event.value instanceof Date ? event.value : null, datatype === "datetime"), valueKey)} />
                      : datatype === "text" ? <InputTextarea id={id} className={inputClassName} autoResize rows={2} value={String(value ?? "")} disabled={computed} onChange={(event) => update(control, event.target.value, valueKey)} />
                        : <InputText id={id} className={inputClassName} value={String(value ?? "")} disabled={computed} onChange={(event) => update(control, event.target.value, valueKey)} />}
      </div>{control.properties.notes && <Button type="button" className="form2-notes-toggle" text rounded icon={openNotes[valueKey] ? "pi pi-file-edit" : "pi pi-file-plus"} aria-label={`${openNotes[valueKey] ? "Ocultar" : "Agregar"} notas de ${fieldLabel}`} onClick={() => setOpenNotes((current) => ({ ...current, [valueKey]: !current[valueKey] }))} />}</div>
      <div className="form2-field-meta">{normalRange && <small className="form2-range"><i className="pi pi-chart-line" /> Rango normal: {normalRange}{control.units ? ` ${control.units}` : ""}</small>}{control.properties.abnormal && <Button type="button" size="small" severity={abnormalState[valueKey] ? "danger" : "secondary"} outlined={!abnormalState[valueKey]} icon={abnormalState[valueKey] ? "pi pi-exclamation-triangle" : "pi pi-check"} label="Anormal" disabled={!value || computed} onClick={() => setAbnormalState((current) => ({ ...current, [valueKey]: !current[valueKey] }))} />}</div>
      {error && <small className="field-error" role="alert">{issueMessage(error, control)}</small>}{!error && warning && <small className="field-warning" role="status">{issueMessage(warning, control)}</small>}
      {control.properties.notes && openNotes[valueKey] && <div className="form2-notes"><label htmlFor={`${id}-notes`}>Notas</label><InputTextarea id={`${id}-notes`} autoResize rows={2} value={comments[valueKey] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [valueKey]: event.target.value }))} /></div>}
    </div>;
  }
  return <><Tooltip target={`.${tooltipTargetClass}`} position="top" mouseTrack mouseTrackLeft={12} mouseTrackTop={12} showDelay={120} hideDelay={60} className="form2-help-tooltip" /><div className="form2-renderer">{renderLayout(definition.controls)}</div></>;
}
