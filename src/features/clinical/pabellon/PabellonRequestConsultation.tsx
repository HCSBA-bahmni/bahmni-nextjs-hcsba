import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "primereact/checkbox";
import { RadioButton } from "primereact/radiobutton";
import { SelectButton } from "primereact/selectbutton";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Button } from "primereact/button";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { useAuth } from "@/features/auth/AuthContext";
import { ClinicalBlock } from "./PabellonClinicalBlock";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
import { requestDisplayFields } from "./requestDisplayFields";
import { requestSnapshotAge } from "./requestSnapshotAge";
import form from "./PabellonRequest.module.css";
import styles from "./PabellonRequestConsultation.module.css";

type Section = NonNullable<NonNullable<PabellonItem["request"]>["sections"]>[number];
type Field = Section["fields"][number];
export function consultationFieldGroups(section: Section, fields: Field[]) {
  const groups = section.key === "patient" ? [
    ["identification", "names", "first-surname", "second-surname"],
    ["birth-date", "age", "sex", "insurance"],
    ["telephone", "commune", "address", "address-number"],
    ["patient-priority", "care-type", "oncology", "latex", "reintervention"],
    ["hospitalized", "prior-hospitalization", "prior-days", "admission"],
    ["prior-reason"], ["diagnosis"],
  ] : section.key === "surgery" ? [
    ["surgeon", "specialty", "duration"], ["approach", "approach-type"],
    ["procedures"], ["surgery-type", "laterality", "laterality-type"], ["additional-plan"],
  ] : [fields.map(field => field.key)];
  const known = new Set(groups.flat());
  return [...groups.map(keys => keys.flatMap(key => fields.filter(field => field.key === key))),
    fields.filter(field => !known.has(field.key))].filter(group => group.length > 0);
}
const binaryKeys = new Set(["latex", "reintervention", "oncology", "hospitalized", "prior-hospitalization", "laterality", "donor", "rh"]);
const longKeys = new Set(["diagnosis", "additional-plan", "prior-reason", "conditions", "equipment", "optional-supplies", "description"]);
const normalize = (value?: string | null) => value?.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase();
export function visibleConsultationFields(section: Section) {
  const value = (key: string) => section.fields.find(field => field.key === key)?.value;
  return section.fields.filter(field => {
    if (section.key === "assessment" && field.key === "assessment-other") return Boolean(field.value?.trim());
    if (section.key === "surgery" && field.key === "laterality-type") return normalize(value("laterality")) !== "NO";
    if (section.key === "surgery" && field.key === "approach-type" && !field.value) return normalize(value("approach")) !== "ABIERTA";
    return true;
  });
}
export function PabellonRequestConsultation({ item }: { item: PabellonItem }) {
  const { user } = useAuth();
  const options = useQuery({
    queryKey: ["pabellon-request-read-options", user?.uuid, item.source.environment, item.id, item.source.revision],
    queryFn: async ({ signal }) => {
      const [assessments, theatres, samples] = await Promise.all([
        loadPabellonSmallCatalogue("preoperative-assessments", signal),
        loadPabellonSmallCatalogue("theatres", signal),
        loadPabellonSmallCatalogue("blood-samples", signal),
      ]);
      return { assessments, theatres, samples };
    }, retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
    enabled: Boolean(item.request?.catalogueSelections),
  });
  const request = item.request;
  if (!request?.sections) return null;
  const sections = request.sections;
  const find = (key: string) => sections.find(section => section.key === key);
  const raw = (section: string, key: string) => find(section)?.fields.find(field => field.key === key)?.value;
  const field = (section: Section, entry: Field) => {
    const value = section.key === "patient" && entry.key === "age" ? requestSnapshotAge(item) : entry.value;
    const original = section.fields.find(row => row.key === entry.key)?.value;
    const id = "read-" + item.id + "-" + section.key + "-" + entry.key;
    if (entry.key === "care-type" && ["MAI", "MLE", "NB"].includes(normalize(value) ?? "")) return <fieldset key={entry.key} className={form.choiceGroup}><legend>{entry.label}</legend><SelectButton aria-label={entry.label} disabled value={normalize(value)} options={["MAI", "MLE", "NB"]} /></fieldset>;
    if (binaryKeys.has(entry.key)) {
      const answer = normalize(original) === "SI" ? true : normalize(original) === "NO" ? false : null;
      return <fieldset key={entry.key} className={form.binary} data-answer={answer === null ? "unset" : answer ? "yes" : "no"}><legend>{entry.label}</legend>
        <SelectButton disabled value={answer} options={[{ label: "Sí", value: true }, { label: "No", value: false }]} />
        {answer === null && <small>No informado en esta snapshot</small>}
        {entry.value && entry.value !== original && <small>{entry.value}</small>}
      </fieldset>;
    }
    if (entry.key === "not-defined" || entry.key === "not-requested") return <p key={entry.key} className={styles.full}>{entry.value}</p>;
    if (section.key === "patient" && entry.key === "second-surname" && !value) return <div key={entry.key} className={form.field}><label htmlFor={id}>{entry.label}</label><InputText id={id} readOnly value="" /></div>;
    const shown = value || (entry.key === "additional-plan" ? "No se indicó plan adicional" : "No informado en esta snapshot");
    return <div key={entry.key} className={longKeys.has(entry.key) || entry.key === "procedures" ? styles.full : form.field}>
      <label htmlFor={id}>{entry.label}</label>{longKeys.has(entry.key) || entry.key === "procedures" || shown.length > 32 ? <InputTextarea id={id} readOnly rows={longKeys.has(entry.key) || entry.key === "procedures" ? 2 : 1} autoResize value={shown} /> : <InputText id={id} readOnly value={shown} />}
    </div>;
  };
  const choices = (group: "assessments" | "theatres" | "samples", selected: string[] | undefined, label: string, radio = false) => {
    if (!selected) return <p>{label}: no informado en esta snapshot.</p>;
    const entries = options.data?.[group] ?? [];
    return <fieldset className={form.choiceGroup} data-catalogue={group === "assessments" ? "preoperative-assessments" : group === "theatres" ? "theatres" : "blood-samples"}><legend>{label}</legend>
      {options.isFetching ? <p role="status">Cargando opciones de Pabellón…</p> : <div className={form.choiceOptions}>{entries.map(option => {
        const id = "read-" + item.id + "-" + group + "-" + option.sourceId;
        return <div key={option.sourceId} className={form.choiceOption}>{radio ? <RadioButton inputId={id} name={group + item.id} checked={selected.includes(option.sourceId)} disabled /> : <Checkbox inputId={id} checked={selected.includes(option.sourceId)} disabled />}<label htmlFor={id}>{option.display}</label></div>;
      })}</div>}
      {selected.filter(id => !entries.some(option => option.sourceId === id)).map(id => <p key={id}>Selección histórica: código {id} (descripción no disponible en el catálogo).</p>)}
      {!radio && selected.length === 0 && <small>Ninguna opción seleccionada</small>}
    </fieldset>;
  };
  const render = (section: Section) => {
    let fields = visibleConsultationFields(section);
    const presentation = requestDisplayFields({ ...section, fields }, request.catalogueSelections);
    fields = presentation;
    if (section.key === "assessment") return <ClinicalBlock key={section.key} title={section.title} icon="pi-clipboard">
      <div className={styles.assessment}>{choices("assessments", request.catalogueSelections?.["preoperative-assessments"], "Evaluaciones preoperatorias")}
        {fields.filter(row => row.key === "asa").map(entry => field(section, entry))}</div>
      {fields.filter(row => row.key === "assessment-other").map(entry => field(section, entry))}
      {choices("theatres", request.catalogueSelections?.theatres, "Ubicación de cirugía", true)}
      {raw("assessment", "theatre") && <small>Ubicación registrada: {raw("assessment", "theatre")}</small>}
      {raw("assessment", "assessments") && <p>Evaluaciones registradas: {raw("assessment", "assessments")}</p>}
    </ClinicalBlock>;
    if (section.key === "biopsy" && section.fields.length > 0 && section.fields.every(row => !row.value)) return <ClinicalBlock key={section.key} title={section.title} icon="pi-file"><p>No se registró una biopsia en esta snapshot.</p></ClinicalBlock>;
    if (section.key === "supplies") fields = fields.map(row => row.key === "kits" && !row.value ? { ...row, value: "No se registraron kits en esta snapshot" } : row);
    return <ClinicalBlock key={section.key} title={section.title} icon={section.key === "surgery" ? "pi-users" : "pi-file"}>
      <div className={styles.groups}>
        {section.key === "blood" && fields[0]?.key !== "not-requested" && choices("samples", request.catalogueSelections?.["blood-samples"], "Productos solicitados")}
        {consultationFieldGroups(section, fields.filter(row => section.key !== "blood" || row.key !== "samples" || !request.catalogueSelections)).map((group, index) =>
          <div key={index} className={styles.row} data-section={section.key}>{group.map(entry => {
            const widths: Record<string, number> = section.key === "patient" ? { identification: 3, names: 5, "first-surname": 2, "second-surname": 2, telephone: 3, commune: 3, address: 4, "address-number": 2, "patient-priority": 3, "care-type": 3, oncology: 2, latex: 2, reintervention: 2 } : section.key === "surgery" ? { surgeon: 5, specialty: 5, duration: 2 } : {};
            const span = longKeys.has(entry.key) || entry.key === "procedures" || group.length === 1 ? 12 : widths[entry.key] ?? Math.max(3, Math.floor(12 / Math.min(group.length, 4)));
            return <div key={entry.key} className={styles.cell} style={{ gridColumn: "span " + span }}>{field(section, entry)}</div>;
          })}</div>)}
      </div>
    </ClinicalBlock>;
  };
  const patient = find("patient"); const hospitalization = find("hospitalization");
  const surgery = find("surgery"); const oncology = surgery?.fields.find(entry => entry.key === "oncology");
  const combined = patient ? { ...patient, fields: [...patient.fields, ...(oncology ? [oncology] : []), ...(hospitalization?.fields ?? [])] } : undefined;
  return <div className={styles.consultation} aria-label="Solicitud de Pabellón en modo lectura">
    {options.isError && <div role="alert">No fue posible cargar las opciones de presentación. Los datos de la snapshot se conservan.<Button text label="Reintentar opciones" loading={options.isFetching} onClick={() => { void options.refetch(); }} /></div>}
    {combined && render(combined)}
    {sections.filter(section => section.key !== "patient" && section.key !== "hospitalization").map(section => render(section.key === "surgery" ? { ...section, fields: section.fields.filter(entry => entry.key !== "oncology") } : section))}
  </div>;
}
