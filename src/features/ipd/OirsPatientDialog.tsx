import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { useEffect, useState } from "react";
import { getOirsBedPatient, getOirsRelationships, ipdQueryKeys, saveOirsBedPatient } from "@/services/bahmni/ipd";

interface Visitor { id?: string | number; doc: string; nombre: string; contacto: string; relationshipId?: number; indigenous: boolean }
interface Props { visible: boolean; onHide(): void; baseUrl: string; patientUuid: string; visitUuid: string; bedNumber?: string; identifier: string; patientName: string; age: string }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function emptyVisitor(): Visitor { return { doc: "", nombre: "", contacto: "", indigenous: false }; }

export function OirsPatientDialog(props: Props) {
  const client = useQueryClient();
  const [notes, setNotes] = useState("");
  const [visitors, setVisitors] = useState<Visitor[]>([emptyVisitor()]);
  const relationships = useQuery({ queryKey: ["ipd", "oirs-relationships", props.baseUrl], queryFn: () => getOirsRelationships(props.baseUrl), enabled: props.visible });
  const existing = useQuery({ queryKey: ipdQueryKeys.oirs(props.patientUuid, props.visitUuid), queryFn: () => getOirsBedPatient(props.baseUrl, props.patientUuid, props.visitUuid), enabled: props.visible });
  useEffect(() => {
    if (!props.visible || existing.isLoading) return;
    const timer = window.setTimeout(() => {
      const row = existing.data;
      setNotes(typeof row?.observaciones === "string" ? row.observaciones : "");
      const source = Array.isArray(row?.visitas_autorizadas) ? row.visitas_autorizadas : [];
      setVisitors(source.length ? source.slice(0, 3).map((value) => { const item = object(value); return { id: typeof item.id === "string" || typeof item.id === "number" ? item.id : undefined, doc: String(item.nro_documento ?? ""), nombre: String(item.nombre ?? ""), contacto: String(item.contacto ?? ""), relationshipId: Number.isFinite(Number(item.id_parentesco)) ? Number(item.id_parentesco) : undefined, indigenous: Boolean(item.pertenece_pueblo) }; }) : [emptyVisitor()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [existing.data, existing.isLoading, props.visible]);
  const mutation = useMutation({
    mutationFn: async () => {
      const normalized = visitors.filter((visitor) => visitor.doc || visitor.nombre || visitor.contacto || visitor.relationshipId);
      if (normalized.some((visitor) => !visitor.doc || !visitor.nombre || !visitor.contacto || !visitor.relationshipId)) throw new Error("Cada visita requiere documento, nombre, contacto y parentesco.");
      const id = existing.data?.id;
      await saveOirsBedPatient(props.baseUrl, typeof id === "string" || typeof id === "number" ? id : undefined, {
        data_paciente: { uuid: props.patientUuid, cama: props.bedNumber ?? null, rut: props.identifier.replace(/^RUN\*/, ""), nombre_paciente: props.patientName, edad: props.age, observaciones: notes || null, id_nacionalidad: null, pertenece_pueblo: null, encounter_id: props.visitUuid },
        visitas_autorizadas: normalized.map((visitor) => ({ ...(visitor.id ? { id: visitor.id } : {}), documento: "RUT", nro_documento: visitor.doc, contacto: visitor.contacto, nombre: visitor.nombre, id_parentesco: visitor.relationshipId, pertenece_pueblo: visitor.indigenous })),
      });
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ipdQueryKeys.oirs(props.patientUuid, props.visitUuid) }); props.onHide(); },
  });
  const update = (index: number, values: Partial<Visitor>) => setVisitors((current) => current.map((visitor, position) => position === index ? { ...visitor, ...values } : visitor));
  return <Dialog header="Paciente acostado y visitas autorizadas" visible={props.visible} modal className="ipd-oirs-dialog" onHide={props.onHide} footer={<><Button outlined label="Cancelar" onClick={props.onHide} /><Button label="Guardar" loading={mutation.isPending} onClick={() => mutation.mutate()} /></>}>
    {existing.isLoading ? <p>Cargando datos OIRS…</p> : <>
      <label>Observaciones<InputTextarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
      <div className="ipd-visitors"><header><h3>Visitas autorizadas</h3><Button text icon="pi pi-plus" label="Añadir" disabled={visitors.length >= 3} onClick={() => setVisitors((current) => [...current, emptyVisitor()])} /></header>{visitors.map((visitor, index) => <fieldset key={index}><legend>Visita {index + 1}</legend><label>RUT<InputText value={visitor.doc} onChange={(event) => update(index, { doc: event.target.value })} /></label><label>Nombre<InputText value={visitor.nombre} onChange={(event) => update(index, { nombre: event.target.value })} /></label><label>Contacto<InputText value={visitor.contacto} onChange={(event) => update(index, { contacto: event.target.value })} /></label><label>Parentesco<Dropdown value={visitor.relationshipId} options={relationships.data ?? []} optionLabel="description" optionValue="id" onChange={(event) => update(index, { relationshipId: event.value as number })} /></label><label className="ipd-check"><Checkbox checked={visitor.indigenous} onChange={(event) => update(index, { indigenous: Boolean(event.checked) })} /> Pertenece a pueblo originario</label><Button text severity="danger" icon="pi pi-trash" aria-label={`Eliminar visita ${index + 1}`} onClick={() => setVisitors((current) => current.filter((_, position) => position !== index))} /></fieldset>)}</div>
      {mutation.isError && <p className="error-banner">{mutation.error instanceof Error ? mutation.error.message : "No se pudo guardar OIRS."}</p>}
    </>}
  </Dialog>;
}
