import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { ClinicalPatientContext } from "./patientContext";
import type { TreatmentSection } from "./drugOrders";

const formatDate = (value: string | number | undefined, locale: string) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "—";

export function treatmentDocument(section: TreatmentSection, patient: ClinicalPatientContext, institution: string, locale: string): TDocumentDefinitions {
  const body: TableCell[][] = [
    ["Medicamento", "Posología", "Inicio", "Profesional"].map((value) => ({ text: value, bold: true, fillColor: "#e7f5f8" })),
    ...section.orders.map((order) => [order.name, [order.dose, order.route, order.frequency, order.duration, order.instructions, order.additionalInstructions].filter(Boolean).join(" · "), formatDate(order.startDate, locale), order.provider]),
  ];
  const content: Content[] = [
    { text: institution, style: "institution" },
    { text: "Receta médica", style: "title" },
    { text: `${patient.name} · ${patient.identifier}`, margin: [0, 0, 0, 4] },
    { text: `Visita: ${formatDate(section.date, locale)}`, margin: [0, 0, 0, 12] },
    { table: { headerRows: 1, widths: ["*", "*", 70, "*"], body }, layout: "lightHorizontalLines" },
  ];
  return { content, styles: { institution: { fontSize: 11, bold: true, color: "#006a88" }, title: { fontSize: 18, bold: true, margin: [0, 4, 0, 6] } }, defaultStyle: { fontSize: 9 } };
}

export async function renderTreatmentPdf(definition: TDocumentDefinitions, mode: "base64" | "blob"): Promise<string | Blob> {
  const [{ default: pdfMake }, pdfFonts] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  pdfMake.vfs = pdfFonts.vfs;
  const document = pdfMake.createPdf(definition);
  return new Promise((resolve) => mode === "base64" ? document.getBase64(resolve) : document.getBlob(resolve));
}
