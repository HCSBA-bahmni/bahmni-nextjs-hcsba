import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { useState } from "react";
import type { FulfillmentFormMember } from "./fulfillment";
import { uploadForm2ComplexFile } from "@/services/bahmni/forms";

export interface PendingFulfillmentFile { url: string; name: string; type: "image" | "pdf"; comment: string }
export interface PendingFulfillmentValues { text: Record<string, string>; files: Record<string, PendingFulfillmentFile[]> }

const fileType = (file: File): "image" | "pdf" | undefined => file.type.includes("pdf") ? "pdf" : file.type.startsWith("image/") ? "image" : undefined;
const dataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Archivo inválido")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

export function FulfillmentForm({ patientUuid, members, onChange }: { patientUuid: string; members: FulfillmentFormMember[]; onChange?(value: PendingFulfillmentValues): void }) {
  const [values, setValues] = useState<PendingFulfillmentValues>({ text: {}, files: {} });
  const [uploading, setUploading] = useState<string>(); const [error, setError] = useState<string>();
  const update = (next: PendingFulfillmentValues) => { setValues(next); onChange?.(next); };
  const upload = async (member: FulfillmentFormMember, file?: File) => {
    if (!file) return; const type = fileType(file); setError(undefined);
    if (!type) return setError("El módulo legacy sólo admite imágenes y archivos PDF.");
    setUploading(member.uuid);
    try {
      const url = await uploadForm2ComplexFile({ dataUrl: await dataUrl(file), patientUuid, fileType: type, fileName: file.name });
      update({ ...values, files: { ...values.files, [member.uuid]: [...(values.files[member.uuid] ?? []), { url, name: file.name, type, comment: "" }] } });
    } catch { setError("No fue posible cargar el archivo."); } finally { setUploading(undefined); }
  };
  return <div className="orders-fulfillment-form">
    {error && <p role="alert" className="error-banner">{error}</p>}
    {members.map((member) => {
      const isImage = member.conceptClass === "Image" && member.datatype === "Complex";
      if (member.datatype === "Text") return <label key={member.uuid} className="orders-fulfillment-field"><span>{member.label}</span><InputTextarea autoResize rows={3} value={values.text[member.uuid] ?? ""} onChange={(event) => update({ ...values, text: { ...values.text, [member.uuid]: event.target.value } })} /></label>;
      if (isImage) return <fieldset key={member.uuid} className="orders-fulfillment-files"><legend>{member.label}</legend><div className="orders-file-grid">{(values.files[member.uuid] ?? []).map((uploaded, index) => <article key={`${uploaded.url}-${index}`} className="orders-file-card">{uploaded.type === "image" ? <img src={`/document_images/${uploaded.url}`} alt={uploaded.name} /> : <a href={`/document_images/${uploaded.url}`} target="_blank" rel="noreferrer"><i className="pi pi-file-pdf" />{uploaded.name}</a>}<InputTextarea rows={2} placeholder="Comentario" value={uploaded.comment} onChange={(event) => { const files = [...(values.files[member.uuid] ?? [])]; files[index] = { ...uploaded, comment: event.target.value }; update({ ...values, files: { ...values.files, [member.uuid]: files } }); }} /><Button type="button" text severity="danger" icon="pi pi-times" label="Quitar" onClick={() => update({ ...values, files: { ...values.files, [member.uuid]: (values.files[member.uuid] ?? []).filter((_, itemIndex) => itemIndex !== index) } })} /></article>)}</div><label className="orders-file-upload"><i className="pi pi-upload" /><span>{uploading === member.uuid ? "Cargando…" : "Agregar imagen o PDF"}</span><input type="file" accept="application/pdf,image/*" capture="environment" disabled={uploading === member.uuid} onChange={(event) => { void upload(member, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></fieldset>;
      return <p key={member.uuid} className="warning-banner">El concepto configurado “{member.label}” usa {member.datatype || "un tipo sin informar"} / {member.conceptClass || "una clase sin informar"}. No se habilita un control hasta portar su comportamiento legacy.</p>;
    })}
  </div>;
}
