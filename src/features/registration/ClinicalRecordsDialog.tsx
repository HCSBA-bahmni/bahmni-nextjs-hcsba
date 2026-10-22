import { useState } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { clinicalCategoryLabels, chartName, type ClinicalCase, type ClinicalChart } from "@/services/mpi/clinicalConsolidation";
import styles from "./ClinicalRecordsDialog.module.css";

function Chart({chart,title}: {chart:ClinicalChart;title:string}) {
  const ids=chart.identifiers.filter(i=>!i.voided && i.type!=="CRID MPI");
  return <section className={styles.chart}><h3>{title}</h3><strong>{chartName(chart)}</strong>
    <dl>{ids.map(id=><div key={id.uuid}><dt>{id.type==="Patient Identifier"?"Número de ficha":id.type}</dt><dd>{id.identifier}</dd></div>)}</dl></section>;
}
export function ClinicalRecordsDialog({row,busy,error,onCancel,onChangePreferred,onSubmit}: {
  row?:ClinicalCase;busy:boolean;error:string;onCancel:()=>void;onChangePreferred:(uuid:string)=>void;
  onSubmit:(reason:string,assignments:Record<string,string>,splitIdentity:boolean)=>void;
}) {
  const [reason,setReason]=useState(""); const [confirmed,setConfirmed]=useState(false);
  const [assignments,setAssignments]=useState<Record<string,string>>({});const [splitIdentity,setSplitIdentity]=useState(false);
  const separating=Boolean(row?.clinical.separation);
  const recovering=row?.status==="consolidating"||row?.status==="separating";
  const p=separating?row?.clinical.separation:row?.clinical.preview;
  const newRows=row?.clinical.separation?.newRecords||[];
  const allowed=recovering||Boolean(confirmed && reason.trim().length>=10 && !p?.blockers.length && newRows.every(r=>assignments[r.key]));
  return <Dialog visible={Boolean(row)} header={separating?"Separar las fichas clínicas":"Consolidar las fichas clínicas"}
    onHide={onCancel} closable={!busy} className={styles.dialog} style={{width:"min(1040px,96vw)"}} draggable={false} dismissableMask={false}
    footer={<div className={styles.footer}><Button label="Volver a la bandeja" outlined disabled={busy} onClick={onCancel}/>
      <Button label={recovering?"Recuperar la operación pendiente":separating?"Confirmar separación":"Confirmar consolidación"} icon={separating?"pi pi-clone":"pi pi-link"}
        severity={separating?"warning":undefined} loading={busy} disabled={!allowed||busy} onClick={()=>onSubmit(reason,assignments,splitIdentity)}/></div>}>
    {row&&p&&<div className={styles.content}>
      <p className={styles.lead}>{separating?"Cada antecedente anterior volverá a su ficha de origen. Los cambios clínicos posteriores se conservarán."
        :"La identidad fue revisada. Ahora comprobará qué antecedentes quedarán disponibles en una sola ficha activa."}</p>
      <ol className={styles.steps}><li>Identidad revisada</li><li aria-current="step">{separating?"Revisar la procedencia":"Revisar las dos historias"}</li><li>{separating?"Restituir y verificar":"Consolidar y verificar"}</li></ol>
      {recovering&&<p className="warning-banner" role="status">La operación tiene pasos pendientes. Se consultará el diario existente para continuar la misma decisión.</p>}
      <div className={styles.charts}><Chart chart={separating?row.clinical.preview.preferred:p.preferred} title={separating?"Ficha que seguirá activa":"Ficha que continuará activa"}/><Chart chart={separating?row.clinical.preview.secondary:p.secondary} title={separating?"Ficha que se reactivará":"Ficha cuyos antecedentes se incorporarán"}/></div>
      {separating&&<p>Se muestran los documentos de origen de cada ficha. Los antecedentes incorporados después de consolidar se revisan a continuación.</p>}
      {!separating&&<p>La ficha activa conservará sus datos personales preferidos. Los valores anteriores permanecerán registrados con su procedencia.</p>}
      {!separating&&!recovering&&<Button label="Cambiar la ficha que continuará activa" text icon="pi pi-arrow-right-arrow-left" disabled={busy} onClick={()=>onChangePreferred(row.clinical.secondaryUuid)}/>}
      <Button label="Actualizar vista previa" outlined icon="pi pi-refresh" disabled={busy} onClick={()=>onChangePreferred(row.clinical.preferredUuid)}/>
      {!separating&&<section><h3>Antecedentes que se conservarán</h3><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Antecedentes</th><th>Ficha activa</th><th>Se incorporan</th><th>Después</th></tr></thead>
        <tbody>{Object.entries(row.clinical.preview.counts).filter(([,c])=>c.preferred+c.secondary>0).map(([category,c])=><tr key={category}><th scope="row">{clinicalCategoryLabels[category]||"Otros antecedentes del módulo"}</th><td>{c.preferred}</td><td>+ {c.secondary}</td><td><strong>{c.preferred+c.secondary}</strong></td></tr>)}</tbody></table></div>
        <p>Los registros conservarán sus identificadores, contenido clínico, fechas y autores. La ficha anterior quedará disponible mediante su referencia a la ficha vigente.</p></section>}
      {separating&&<section><h3>Antecedentes incorporados después de consolidar</h3><p>{newRows.length?"Seleccione su destino. Los antecedentes de una misma atención deben quedar juntos.":"No hay antecedentes nuevos que asignar. Se restituirá la pertenencia registrada en el diario."}</p>
        {newRows.map((r,index)=><label className={styles.assignment} key={r.key}><span>{clinicalCategoryLabels[r.category]||"Antecedente clínico"} {index+1}<small>{r.description || "Registro incorporado después de consolidar"}</small></span>
          <select aria-label={`Destino de ${clinicalCategoryLabels[r.category]||"antecedente"} ${index+1}`} value={assignments[r.key]||""} disabled={busy||recovering} onChange={e=>setAssignments({...assignments,[r.key]:e.target.value})}>
            <option value="">Seleccionar ficha…</option><option value="preferred">Ficha que seguirá activa</option><option value="secondary">Ficha que se reactivará</option></select></label>)}
        {!recovering&&<label className={styles.check}><input type="checkbox" checked={splitIdentity} onChange={e=>setSplitIdentity(e.target.checked)}/><span>También confirmé que son personas distintas: separar su identidad en el registro de pacientes.<small>Si conserva esta opción desmarcada, se separan las historias y la identidad común permanece asociada.</small></span></label>}
      </section>}
      <p className="warning-banner">{separating?"Separar no elimina ni reescribe la evolución clínica. Si algún antecedente tiene una pertenencia incompatible, deberá revisarse antes de confirmar.":"Consolidar no elimina resultados repetidos ni corrige por sí solo alergias, diagnósticos o fechas diferentes. Esas diferencias requieren revisión clínica."}</p>
      <p>El alcance es la historia en OpenMRS y la asociación de identidad local. Los sistemas externos, como laboratorio o imágenes, requieren su conciliación específica.</p>
      {p.blockers.length>0&&<div className="error-banner" role="alert"><strong>Antes de continuar</strong><ul>{p.blockers.map(b=><li key={b}>{b}</li>)}</ul></div>}
      {!recovering&&<><label className={styles.reason}>Motivo y evidencia de la decisión<InputTextarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} maxLength={1000} disabled={busy} placeholder="Indique los documentos cotejados y el motivo de consolidar o separar."/></label>
        <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/><span>Revisé las fichas, sus antecedentes y el efecto de esta operación.</span></label></>}
      {error&&<p className="error-banner" role="alert">{error}</p>}
    </div>}
  </Dialog>;
}
