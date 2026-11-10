import { InputText } from "primereact/inputtext";
import { SelectButton } from "primereact/selectbutton";
import { ClinicalBlock } from "./PabellonClinicalBlock";
import { PabellonCataloguePicker } from "./PabellonCataloguePicker";
import { updatePabellonSurgeonDraft, type PabellonSurgeonDraft } from "./pabellonSurgeonDraft";
import styles from "./PabellonRequest.module.css";
interface Props { scopeKey: string; value: PabellonSurgeonDraft; onChange(value: PabellonSurgeonDraft): void; disabled?: boolean; embedded?: boolean }
export function PabellonSurgeonFields({ scopeKey, value, onChange, disabled = false, embedded = false }: Props) {
  const patch = (changes: Partial<PabellonSurgeonDraft>) => onChange(updatePabellonSurgeonDraft(value, changes));
  const content = <>
    {value.mode === "registered" ? <PabellonCataloguePicker scopeKey={scopeKey} catalogue="surgeons" label="Médico que indica la cirugía" required disabled={disabled}
      value={value.selected ? [value.selected] : []} onChange={(items) => patch({ selected: items[0] ?? null })} /> :
      <div className={styles.field}><label htmlFor="pabellon-manual-surgeon">Nombre completo del médico *</label><InputText id="pabellon-manual-surgeon" value={value.name} disabled={disabled} maxLength={255} onChange={(event) => patch({ name: event.target.value })} />
      <small>Esta opción registra el nombre en la solicitud; no crea un profesional en el mantenedor.</small></div>}
    <fieldset className={styles.binary}><legend>Forma de identificar al médico</legend>
      <SelectButton value={value.mode} allowEmpty={false} disabled={disabled}
        options={[{ label: "Seleccionar médico registrado", value: "registered" }, { label: "Ingresar nombre", value: "manual" }]}
        onChange={(event) => { if (event.value === "registered" || event.value === "manual") patch({ mode: event.value }); }} />
    </fieldset>
    <p className={styles.pickerFooter}>El médico indicado y el usuario que envía la solicitud son datos distintos. Esta selección no cambia permisos ni vincula cuentas.</p>
  </>;
  return embedded ? content : <ClinicalBlock title="Médico que indica la cirugía" icon="pi-user">{content}</ClinicalBlock>;
}
