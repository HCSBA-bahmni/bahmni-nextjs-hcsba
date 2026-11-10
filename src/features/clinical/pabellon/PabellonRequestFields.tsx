import type { ReactNode } from "react";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { InputTextarea } from "primereact/inputtextarea";
import { SelectButton } from "primereact/selectbutton";
import type { PabellonClinicalCatalogueName as Catalogue, PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { ClinicalBlock } from "./PabellonClinicalBlock";
import { PabellonCataloguePicker } from "./PabellonCataloguePicker";
import { updatePabellonClinicalDraft, type PabellonClinicalDraft } from "./pabellonClinicalDraft";
import styles from "./PabellonRequest.module.css";

const yesNo = [{ label: "Sí", value: true }, { label: "No", value: false }];
interface Props {
  scopeKey: string; value: PabellonClinicalDraft; onChange(value: PabellonClinicalDraft): void;
  disabled?: boolean; patientFields?: ReactNode; surgeonFields?: ReactNode;
  approachTypes?: PabellonCatalogueOption[]; approachError?: string; onRetryApproaches?(): void;
}
/** Native request order and explicit decisions; no registration or send side effects. */
export function PabellonRequestFields({ scopeKey, value, onChange, disabled = false, patientFields, surgeonFields, approachTypes, approachError, onRetryApproaches }: Props) {
  const patch = (changes: Partial<PabellonClinicalDraft>) => onChange(updatePabellonClinicalDraft(value, changes));
  const select = (catalogue: Catalogue, label: string, required = false, multiple = false) =>
    <PabellonCataloguePicker key={catalogue} scopeKey={scopeKey} catalogue={catalogue} label={label} required={required} multiple={multiple}
      disabled={disabled} parentId={catalogue === "approach-types" ? value.selections["surgical-approaches"][0]?.sourceId : undefined}
      value={value.selections[catalogue]} onChange={(items) => patch({ selections: { ...value.selections, [catalogue]: items } })} />;
  type Binary = "hospitalized" | "priorHospitalization" | "oncology" | "latexAllergy" | "reintervention" | "lateral" | "donor" | "rh" | "biopsy" | "bloodProducts" | "destinationBed";
  const binary = (key: Binary, label: string, options = yesNo) =>
    <fieldset className={styles.binary} data-answer={value[key] === true ? "yes" : value[key] === false ? "no" : "unset"}><legend>{label} *</legend><SelectButton value={value[key]} options={options} disabled={disabled}
      onChange={(event) => patch({ [key]: typeof event.value === "boolean" ? event.value : null })} /></fieldset>;
  const narrative = (key: "priorReason" | "additionalPlan" | "otherAssessments" | "destinationConditions" | "bloodDescription" | "medicalEquipment" | "optionalSupplies", label: string, required = false) =>
    <div className={styles.field}><label htmlFor={"pabellon-" + key}>{label}{required ? " *" : ""}</label><InputTextarea id={"pabellon-" + key} rows={5} autoResize maxLength={key === "otherAssessments" ? 2000 : 5000} disabled={disabled} value={value[key]} onChange={(event) => patch({ [key]: event.target.value })} /></div>;
  const parent = value.selections["surgical-approaches"][0]?.sourceId;
  const hasTypes = approachTypes?.some((item) => item.relations.some((relation) => relation.sourceId === parent));
  const other = value.selections["preoperative-assessments"].some((item) => item.display.trim().toLocaleUpperCase("es") === "OTROS");
  return <div>
    <ClinicalBlock title="Datos del paciente" icon="pi-user">
      {patientFields}
      <div className={styles.patientGrid}>
        {select("patient-priorities", "Prioridad paciente", true)}
        {binary("oncology", "¿Paciente oncológico?")}
        {binary("latexAllergy", "¿Alergia al látex?")}
        {binary("reintervention", "¿Es reintervención quirúrgica?")}
        {select("care-types", "Tipo de atención", true)}
        {binary("hospitalized", "¿Paciente hospitalizado?")}
        {value.hospitalized === false && binary("priorHospitalization", "¿Requiere hospitalización previa?")}
        {value.hospitalized === false && value.priorHospitalization === true && select("prior-hospitalization-days", "Días de hospitalización previa", true)}
        {select("admission-services", "Servicio de ingreso", true)}
      </div>
      {value.hospitalized === false && value.priorHospitalization === true && narrative("priorReason", "Motivo de hospitalización previa", true)}
      <div className={styles.field}><label htmlFor="pabellon-diagnosis">Diagnóstico preoperatorio *</label><InputTextarea id="pabellon-diagnosis" rows={3} maxLength={2000} autoResize disabled={disabled} value={value.diagnosis} onChange={(event) => patch({ diagnosis: event.target.value })} /></div>
    </ClinicalBlock>
    <ClinicalBlock title="Evaluación preoperatoria" icon="pi-clipboard">
      <div className={styles.preoperativeGrid}>
        {select("preoperative-assessments", "Evaluaciones preoperatorias", false, true)}
        {select("asa", "ASA")}
        {other && narrative("otherAssessments", "Nombre de otras evaluaciones", true)}
      </div>
      {select("theatres", "Ubicación de cirugía", true)}
    </ClinicalBlock>
    <ClinicalBlock title="Programación cirugía" icon="pi-users">
      <div className={styles.programmingGrid}>
        <div className={styles.surgeonColumn}>{surgeonFields}</div>
        {select("specialties", "Especialidad", true)}
        <div className={styles.field}><label htmlFor="pabellon-duration">Duración estimada (HH:mm) *</label><InputText id="pabellon-duration" placeholder="00:00" maxLength={5} autoComplete="off" disabled={disabled} value={value.duration} aria-describedby="pabellon-duration-help" onFocus={(event) => event.target.select()} onChange={(event) => patch({ duration: event.target.value })} /><small id="pabellon-duration-help">Horas y minutos de duración. Ejemplo: 01:30 = 1 hora y 30 minutos.</small></div>
      </div>
      <div className={styles.programmingGrid}>
        {select("surgical-approaches", "Vía de abordaje", true)}
        {hasTypes && select("approach-types", "Tipo de vía de abordaje", true)}
        {parent && approachTypes === undefined && !approachError && <p role="status">Verificando tipos de vía de abordaje…</p>}
        {parent && approachError && <div role="alert"><p>{approachError}</p><button type="button" disabled={disabled} onClick={onRetryApproaches}>Reintentar tipos de vía</button></div>}
      </div>
      {select("procedures", "Plan quirúrgico — código MAI y prestación", true, true)}
      <div className={styles.grid}>
        {select("surgery-types", "Tipo de cirugía", true)}
        {binary("lateral", "¿Tiene lateralidad?")}
        {value.lateral === true && <div className={styles.field}><label htmlFor="pabellon-side">Lateralidad *</label><Dropdown inputId="pabellon-side" value={value.side} options={[{ label: "Bilateral", value: "bilateral" }, { label: "Derecha", value: "derecha" }, { label: "Izquierda", value: "izquierda" }]} disabled={disabled} placeholder="Seleccione" onChange={(event) => patch({ side: event.value })} /></div>}
      </div>
      {narrative("additionalPlan", "Plan quirúrgico adicional")}
    </ClinicalBlock>
    <ClinicalBlock title="Biopsia" icon="pi-file-plus">
      <div className={styles.programmingGrid}>
        {binary("biopsy", "Biopsia")}
        {value.biopsy === true && select("biopsy-types", "Tipo de biopsia", true)}
      </div>
    </ClinicalBlock>
    <ClinicalBlock title="Necesidad producto sanguíneo" icon="pi-heart">
      {binary("bloodProducts", "Producto sanguíneo")}
      {value.bloodProducts === true && <>
        <div className={styles.bloodGrid}>
          {select("blood-samples", "Tipo de hemoderivado", true, true)}
          {binary("rh", "Factor RH", [{ label: "Positivo", value: true }, { label: "Negativo", value: false }])}
          {select("blood-groups", "Grupo sanguíneo", true)}
          {binary("donor", "¿Se solicitaron donantes?")}
        </div>
        {narrative("bloodDescription", "Descripción", true)}
      </>}
    </ClinicalBlock>
    <ClinicalBlock title="Insumos y equipos médicos" icon="pi-box">
      <div className={styles.field}><label htmlFor="pabellon-kits">Solicitar Kit de Insumo</label><MultiSelect inputId="pabellon-kits" value={[]} options={[]} disabled placeholder="Kits bloqueados por ahora" aria-describedby="pabellon-kits-status" /><small id="pabellon-kits-status">Selección y detalle de kits bloqueados por indicación del responsable. No se generan requisiciones en Sofya.</small></div>
      <div className={styles.grid}>
        {narrative("medicalEquipment", "Solicitar equipos médicos")}
        {narrative("optionalSupplies", "Insumos opcionales")}
      </div>
    </ClinicalBlock>
    <ClinicalBlock title="Prioridad y salida" icon="pi-sign-out">
      {binary("destinationBed", "¿Requiere cama de salida?")}
      {value.destinationBed === true && <>{select("destination-services", "Cama de salida", true)}{narrative("destinationConditions", "Condiciones de prioridad (opcional)")}</>}
    </ClinicalBlock>
  </div>;
}
