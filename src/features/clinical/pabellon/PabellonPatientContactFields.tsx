import Link from "next/link";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import type { ClinicalPatientContext } from "../patientContext";
import { ClinicalField } from "./PabellonClinicalBlock";
import { PabellonCataloguePicker } from "./PabellonCataloguePicker";
import type { PabellonContactOverrides } from "./pabellonContactOverrides";
import type { PabellonContactDraft } from "./pabellonContactDraft";
import styles from "./PabellonRequest.module.css";
import { formatPabellonDate } from "./pabellonDates";
interface Props {
  sourceLabel?: string;
  scopeKey: string; patient: ClinicalPatientContext; value: PabellonContactDraft; issues: string[];
  overrides: PabellonContactOverrides; onChange(patch: Partial<PabellonContactDraft>): void;
  loading?: boolean; error?: boolean; disabled?: boolean; onRefresh(): void;
}
/** Native identity is read-only; contact corrections belong only to this request. */
export function PabellonPatientContactFields({ scopeKey, patient, value, issues, overrides, onChange, loading = false, error = false, disabled = false, onRefresh, sourceLabel = "Registro HIS" }: Props) {
  const birthLabel = formatPabellonDate(patient.birthDate);
  const blocked = disabled || loading || error;
  const origin = (key: keyof PabellonContactDraft) => <small>{Object.hasOwn(overrides, key) ? "Completado o corregido para esta solicitud." : value[key] ? "Precargado de " + sourceLabel + "." : "Complete para esta solicitud."}</small>;
  const text = (key: "telephone" | "address" | "addressNumber", label: string, maxLength: number) => <div className={styles.field}>
    <label htmlFor={"pabellon-contact-" + key}>{label} *</label>
    <InputText id={"pabellon-contact-" + key} value={value[key]} maxLength={maxLength} disabled={blocked} onChange={(event) => onChange({ [key]: event.target.value })} />
    {origin(key)}
  </div>;
  return <div>
    <p>Se precargan los datos disponibles de {sourceLabel}. Complete o seleccione aquí los datos faltantes o ambiguos. Los cambios quedan solo en la fotografía de esta solicitud; no modifican Personas ni el Registro HIS.</p>
    <div className="dashboard-inline-actions">
      <Link href={`/registration/patient/${encodeURIComponent(patient.uuid)}`} target="_blank" rel="noopener noreferrer">Revisar o completar Registro del paciente</Link>
      <Button type="button" text icon="pi pi-refresh" label="Actualizar datos del Registro" loading={loading} disabled={loading || disabled} onClick={onRefresh} />
    </div>
    {loading && <p role="status">Cargando datos del Registro del paciente…</p>}
    {error && <p role="alert">No fue posible cargar los datos del Registro. No se utilizarán datos de otro paciente ni valores de relleno.</p>}
    {!loading && !error && issues.length > 0 && <details className="warning-banner"><summary>Datos que no pudieron precargarse del Registro</summary><p>Puede completarlos en los campos de esta solicitud. Esta lista describe la precarga, no los datos ya corregidos.</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details>}
    <dl className={styles.patientGrid}>
      <ClinicalField title="Identificación">{patient.runIdentifier || patient.identifier}</ClinicalField>
      <ClinicalField title="Nombres">{patient.givenNames}</ClinicalField>
      <ClinicalField title="Apellido paterno">{patient.familyName}</ClinicalField>
      <ClinicalField title="Apellido materno">{patient.secondFamilyName}</ClinicalField>
      <ClinicalField title="Edad">{patient.age !== undefined ? patient.age + " años" : ""}</ClinicalField>
      <ClinicalField title="Fecha de nacimiento">{birthLabel}</ClinicalField>
      <ClinicalField title="Género del Registro HIS">{({ F: "Femenino", M: "Masculino", U: "Desconocido", O: "Otro" } as Record<string, string>)[patient.gender] || patient.gender}</ClinicalField>
    </dl>
    <div className={styles.patientGrid}>
      <div><PabellonCataloguePicker scopeKey={scopeKey} catalogue="sexes" label="Sexo (catálogo Pabellón)" required disabled={blocked} value={value.sex ? [value.sex] : []} onChange={(items) => onChange({ sex: items[0] ?? null })} />{origin("sex")}</div>
      {text("telephone", "Teléfono de contacto", 20)}
      <div><PabellonCataloguePicker scopeKey={scopeKey} catalogue="communes" label="Comuna" required disabled={blocked} value={value.commune ? [value.commune] : []} onChange={(items) => onChange({ commune: items[0] ?? null })} />{origin("commune")}</div>
      {text("address", "Dirección", 255)}
      {text("addressNumber", "N° casa / departamento", 20)}
      <div><PabellonCataloguePicker scopeKey={scopeKey} catalogue="insurances" label="Previsión" required disabled={blocked} value={value.insurance ? [value.insurance] : []} onChange={(items) => onChange({ insurance: items[0] ?? null })} />{origin("insurance")}</div>
      {value.insurance?.code === "1" && <div className={styles.field}><label htmlFor="pabellon-contact-segment">Tramo FONASA *</label>
        <Dropdown inputId="pabellon-contact-segment" value={value.insuranceSegment || null} options={["A", "B", "C", "D"]} placeholder="Seleccione" disabled={blocked} onChange={(event) => onChange({ insuranceSegment: event.value })} />{origin("insuranceSegment")}</div>}
    </div>
    <p><small>Actualizar la precarga conserva las correcciones de esta solicitud. Para cambiar nombres, identificación o nacimiento, revise el Registro HIS.</small></p>
  </div>;
}
