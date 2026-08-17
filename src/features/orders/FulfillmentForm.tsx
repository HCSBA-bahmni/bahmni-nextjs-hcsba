import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { useState } from "react";
import type { FulfillmentDraft, FulfillmentDraftFile, FulfillmentFormMember } from "./fulfillment";

export type PendingFulfillmentFile = FulfillmentDraftFile;
export type PendingFulfillmentValues = FulfillmentDraft;

const fileType = (file: File): "image" | "pdf" | undefined => file.type.includes("pdf") ? "pdf" : file.type.startsWith("image/") ? "image" : undefined;
const dataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Archivo inválido")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

export function FulfillmentForm({ members, initialValues, onChange }: { members: FulfillmentFormMember[]; initialValues?: PendingFulfillmentValues; onChange?(value: PendingFulfillmentValues): void }) {
  const [values, setValues] = useState<PendingFulfillmentValues>(initialValues ?? { text: {}, files: {} });
  const [error, setError] = useState<string>();
  const update = (next: PendingFulfillmentValues) => { const changed = { ...next, changed: true }; setValues(changed); onChange?.(changed); };
  const selectFile = async (member: FulfillmentFormMember, file?: File) => {
    if (!file) return; const type = fileType(file); setError(undefined);
    if (!type) return setError("El módulo legacy sólo admite imágenes y archivos PDF.");
    try {
      update({ ...values, files: { ...values.files, [member.uuid]: [...(values.files[member.uuid] ?? []), { dataUrl: await dataUrl(file), name: file.name, type, comment: "" }] } });
    } catch { setError("No fue posible leer el archivo."); }
  };
  const renderMembers = (items: FulfillmentFormMember[]) => items.map((member) => {
    if (member.children.length) return <fieldset key={member.uuid} className="orders-fulfillment-files"><legend>{member.label}</legend>{renderMembers(member.children)}</fieldset>;
    const isImage = member.conceptClass === "Image" && member.datatype === "Complex";
    if (member.datatype === "Text") return <label key={member.uuid} className="orders-fulfillment-field"><span>{member.label}</span><InputTextarea autoResize rows={3} value={values.text[member.uuid] ?? ""} onChange={(event) => update({ ...values, text: { ...values.text, [member.uuid]: event.target.value } })} /></label>;
    if (isImage) return <fieldset key={member.uuid} className="orders-fulfillment-files"><legend>{member.label}</legend><div className="orders-file-grid">{(values.files[member.uuid] ?? []).map((selected, index) => <article key={`${selected.uuid ?? selected.name}-${index}`} className="orders-file-card">{selected.type === "image" ? <img src={selected.dataUrl ?? `/document_images/${selected.url}`} alt={selected.name} /> : <a href={selected.url ? `/document_images/${selected.url}` : undefined} target="_blank" rel="noreferrer"><i className="pi pi-file-pdf" />{selected.name}</a>}<InputTextarea rows={2} maxLength={255} placeholder="Comentario" value={selected.comment} onChange={(event) => { const files = [...(values.files[member.uuid] ?? [])]; files[index] = { ...selected, comment: event.target.value }; update({ ...values, files: { ...values.files, [member.uuid]: files } }); }} /><Button type="button" text severity="danger" icon="pi pi-times" label="Quitar" onClick={() => update({ ...values, files: { ...values.files, [member.uuid]: (values.files[member.uuid] ?? []).filter((_, itemIndex) => itemIndex !== index) } })} /></article>)}</div><label className="orders-file-upload"><i className="pi pi-upload" /><span>Agregar imagen o PDF</span><input type="file" accept="application/pdf,image/*" capture="environment" onChange={(event) => { void selectFile(member, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></fieldset>;
    return <p key={member.uuid} className="warning-banner">El concepto configurado “{member.label}” usa {member.datatype || "un tipo sin informar"} / {member.conceptClass || "una clase sin informar"}. No se habilita un control hasta portar su comportamiento legacy.</p>;
  });
  return <div className="orders-fulfillment-form">
    {error && <p role="alert" className="error-banner">{error}</p>}
    {renderMembers(members)}
  </div>;
}
