import {useRef,useState} from "react";
import {Button} from "primereact/button";
import {Dialog} from "primereact/dialog";
import {Dropdown} from "primereact/dropdown";
import {InputText} from "primereact/inputtext";
import type {ClinicalDashboardContext} from "../dashboardContext";
import {requestPabellonLink,type RequestLinkResult} from "@/services/bahmni/pabellonRequestLink";
import styles from "./PabellonRequest.module.css";
import { formatPabellonVisit } from "./pabellonDates";
interface Props{context:ClinicalDashboardContext;disabled?:boolean;onChanged():void}
export function PabellonRequestLink({context,disabled,onChanged}:Props){
  const [open,setOpen]=useState(false),[number,setNumber]=useState(""),[visit,setVisit]=useState(""),[current,setCurrent]=useState<RequestLinkResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState<"link"|"unlink"|null>(null);
  const inFlight=useRef(false);
  const visits=(context.visits??[]).filter(v=>!v.voided&&(!v.patient?.uuid||v.patient.uuid===context.patient.uuid));
  const options=visits.map(v=>({value:v.uuid,label:(v.visitType?.display||"Atención")+" · "+formatPabellonVisit(v.startDatetime,context.timeZone)+(v.stopDatetime?" · Cerrada":" · Activa")}));
  const run=async(action:"preview"|"link"|"unlink")=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");
    try{
      const next=await requestPabellonLink(context.patient.uuid,{action,requestNumber:number,visitUuid:action==="link"?visit:"",encounterUuid:"",expectedVersion:action==="preview"?0:current?.version??0});
      setCurrent(next);setConfirm(null);setVisit(next.active?next.visitUuid:visit);
      if(action!=="preview")onChanged();
    }catch{
      setCurrent(null);setConfirm(null);
      setError(action==="preview"?"No se pudo verificar la solicitud. Compruebe el número, que pertenezca a este paciente y su acceso a Pabellón.":"No se pudo confirmar el cambio. Vuelva a verificar el N° de solicitud antes de intentarlo otra vez; el cambio podría haberse guardado.");
    }finally{inFlight.current=false;setBusy(false)}
  };
  return <>
    <Button type="button" text label="Vincular solicitud existente" icon="pi pi-link" disabled={disabled} onClick={()=>setOpen(true)}/>
    <Dialog draggable={false} header="Vincular solicitud existente" visible={open} modal blockScroll closable={!busy} closeOnEscape={!busy} onHide={()=>{if(!busy)setOpen(false)}} style={{width:"min(850px,96vw)"}}>
      <p>Asocie una solicitud de Pabellón a una atención de este paciente. No crea ni modifica la cirugía, sus protocolos o snapshots.</p>
      <div className={styles.grid}>
        <div className={styles.field}><label htmlFor="request-link-number">N° de solicitud *</label><InputText id="request-link-number" inputMode="numeric" maxLength={9} value={number} disabled={busy} onChange={e=>{setNumber(e.target.value.replace(/\D/g,""));setCurrent(null);setConfirm(null);setError("")}}/></div>
        <div className={styles.field}><label htmlFor="request-link-visit">Atención HIS *</label><Dropdown inputId="request-link-visit" value={visit} options={options} disabled={busy} onChange={e=>{setVisit(e.value);setConfirm(null)}} placeholder="Seleccione la atención" className="w-full"/></div>
      </div>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <Button type="button" label="Verificar solicitud" loading={busy} disabled={busy||number.length!==9} onClick={()=>void run("preview")}/>
      {current&&<div role="status"><p>Solicitud <strong>{current.requestNumber}</strong> verificada para este paciente.</p><p>{current.active?"Atención vinculada: "+(options.find(v=>v.value===current.visitUuid)?.label||"Atención no disponible en esta ficha") :"Sin atención vinculada."}</p>
        <Button type="button" label={current.active?"Cambiar atención":"Vincular a la atención"} disabled={busy||!visit||current.active&&visit===current.visitUuid} onClick={()=>setConfirm("link")}/>
        {current.active&&<Button type="button" text severity="danger" label="Desvincular" disabled={busy} onClick={()=>setConfirm("unlink")}/>}
      </div>}
      {confirm&&<div className="warning-banner"><p>{confirm==="unlink"?"¿Desvincular esta solicitud de la atención HIS? La cirugía y su historial permanecerán intactos.":"¿Confirmar la asociación con la atención seleccionada? La operación quedará registrada en el historial de vínculos."}</p><Button type="button" label="Confirmar" loading={busy} disabled={busy} onClick={()=>void run(confirm)}/><Button type="button" text label="Cancelar" disabled={busy} onClick={()=>setConfirm(null)}/></div>}
    </Dialog>
  </>;
}
