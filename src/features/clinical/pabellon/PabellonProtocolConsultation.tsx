import { InputText } from "primereact/inputtext";
import { SelectButton } from "primereact/selectbutton";
import { formatPabellonDate, formatPabellonDateTime } from "./pabellonDates";
import form from "./PabellonRequest.module.css";
import { InputTextarea } from "primereact/inputtextarea";
import type { PabellonProtocolVersion } from "@/services/bahmni/pabellonProtocols";
import { ClinicalBlock } from "./PabellonClinicalBlock";
import styles from "./PabellonProtocolConsultation.module.css";

export function PabellonProtocolConsultation({ version }: { version: PabellonProtocolVersion }) {
  if (version.clinical.sections) return <CompleteProtocol version={version} />;
  const data = version.clinical;
  const names = data.patientAtRegistration;
  const name = [names?.givenNames, names?.familyName, names?.secondFamilyName].filter(Boolean).join(" ");
  const field = (key: string, label: string, value: string | null, narrative = false) => {
    const id = "protocol-read-" + version.snapshotId + "-" + key;
    const shown = value || "No informado en la respuesta de esta versión";
    return <div className={styles.field}><label htmlFor={id}>{label}</label>
      {narrative || shown.length > 40 ? <InputTextarea id={id} readOnly rows={narrative ? 3 : 1} autoResize value={shown} /> : <InputText id={id} readOnly value={shown} />}
    </div>;
  };
  return <div className={styles.consultation} aria-label="Protocolo de Pabellón en modo lectura">
    <ClinicalBlock title="Datos del paciente" icon="pi-user">
      {field("patient", "Nombre", name || null)}
      <p className={styles.note}>Datos de la snapshot de esta versión del protocolo. La respuesta de integración aún no incluye identificación, previsión, nacimiento y demás campos del visor nativo; no se completan desde la ficha actual.</p>
    </ClinicalBlock>
    <ClinicalBlock title="Datos del equipo médico" icon="pi-users">
      {field("surgeon", "Cirujano", data.surgeon)}
      {data.team.length ? <div className={styles.team}>{data.team.map((member, index) => <div key={index} className={styles.member}>
        {field("role-" + index, "Rol", member.role?.display || member.role?.code || null)}
        {field("name-" + index, "Profesional", member.name)}
      </div>)}</div> : <p>No se registraron integrantes adicionales en la respuesta de esta versión.</p>}
    </ClinicalBlock>
    <ClinicalBlock title="Datos de la intervención" icon="pi-heart">
      <h3 className={styles.subheading}>Datos postoperatorios</h3>
      {field("diagnosis", "Diagnóstico postoperatorio", data.diagnosis, true)}
      {field("procedures", "Intervención practicada", data.procedures.map(item => item.display || item.code).join("\n") || null, true)}
      {data.additionalProcedure ? field("additional", "Intervención practicada adicional", data.additionalProcedure, true) : <p>No se registró una intervención adicional en la respuesta de esta versión.</p>}
      <div className={styles.row}>{field("laterality", "Tipo de lateralidad postoperatoria", data.laterality)}</div>
      <p className={styles.note}>Los indicadores Sí/No, heridas y datos preoperatorios no están incluidos en la respuesta actual. Un lado ausente no se interpreta como «No».</p>
    </ClinicalBlock>
    <ClinicalBlock title="Detalle de la intervención" icon="pi-file-edit">
      {field("detail", "Detalle operatorio", data.surgicalDetail, true)}
      {data.observations && field("observations", "Observaciones", data.observations, true)}
    </ClinicalBlock>
  </div>;
}
function CompleteProtocol({ version }: { version: PabellonProtocolVersion }) {
  const data = version.clinical;
  const binaryKeys = new Set(["lateral", "oncology", "latex", "alive", "biopsy", "implants", "imaging", "antibiotics", "culture"]);
  const narratives = new Set(["diagnosis", "procedures", "additional", "detail", "observations"]);
  const dates = new Set(["written-at", "intervention-date", "birth-date", "started-at", "ended-at"]);
  const shownField = (section: string, entry: NonNullable<typeof data.sections>[number]["fields"][number]) => {
    const id = "protocol-" + version.snapshotId + "-" + section + "-" + entry.key;
    const normalized = entry.value?.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
    if (binaryKeys.has(entry.key) && (normalized === "SI" || normalized === "NO")) return <fieldset key={entry.key} className={form.binary} data-answer={normalized === "SI" ? "yes" : "no"}><legend>{entry.label}</legend><SelectButton disabled value={normalized === "SI"} options={[{ label: "Sí", value: true }, { label: "No", value: false }]} /></fieldset>;
    const value = dates.has(entry.key) && entry.value ? ["birth-date", "intervention-date"].includes(entry.key) ? formatPabellonDate(entry.value) : formatPabellonDateTime(entry.value) : entry.value ?? (entry.key === "second-surname" ? "" : "No consignado en esta snapshot");
    return <div key={entry.key} className={styles.field} style={narratives.has(entry.key) ? { gridColumn: "1 / -1" } : undefined}><label htmlFor={id}>{entry.label}</label>{narratives.has(entry.key) || value.length > 45 ? <InputTextarea id={id} readOnly rows={narratives.has(entry.key) ? 2 : 1} autoResize value={value} /> : <InputText id={id} readOnly value={value} />}</div>;
  };
  return <div className={styles.consultation} aria-label="Protocolo completo desde su snapshot">{data.sections!.map(section => {
    const lateral = section.fields.find(field => field.key === "lateral")?.value;
    const fields = section.fields.filter(field => !(field.key === "side" && lateral === "NO") && !(["observations", "additional"].includes(field.key) && !field.value));
    if (section.key === "authorship" && fields.every(field => !field.value)) return null;
    return <ClinicalBlock key={section.key} title={section.title} icon={section.key === "team" ? "pi-users" : section.key === "patient" ? "pi-user" : "pi-file"}>
      <div className={styles.completeGrid}>{fields.map(entry => shownField(section.key, entry))}
        {section.key === "postoperative" && shownField(section.key, { key: "procedures", label: "Intervención practicada", value: data.procedures.map(item => item.display || item.code).join("\n") || null })}
      </div>
      {section.key === "team" && <div className={styles.team}>{data.team.map((member, index) => <div key={index} className={styles.member}>{shownField(section.key, { key: "role-" + index, label: "Rol", value: member.role?.display || member.role?.code || null })}{shownField(section.key, { key: "name-" + index, label: "Profesional", value: member.name })}</div>)}</div>}
    </ClinicalBlock>;
  })}</div>;
}
