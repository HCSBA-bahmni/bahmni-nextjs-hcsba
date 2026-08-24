import type { PatientFormValues } from "@/types/bahmni";
import { encodeCode128 } from "./code128";

export const printTemplateRegistry = {
  "registrationCardLayout/print_local.html": LocalCard,
  "registrationCardLayout/print.html": StandardCard,
  "supplementalPaperLayout/print.html": SupplementaryDocument,
  "registrationCardLayout/printWithBarcode.html": BarcodeCard,
} as const;

export function resolvePrintTemplate(templateUrl: string) {
  const normalized = templateUrl.replace(/\\/g, "/");
  const key = Object.keys(printTemplateRegistry).find((candidate) => normalized.endsWith(candidate));
  return key ? printTemplateRegistry[key as keyof typeof printTemplateRegistry] : undefined;
}

function FullName({ patient }: { patient: PatientFormValues }) {
  return <>{[patient.givenName, patient.middleName, patient.familyName, patient.familyName2].filter(Boolean).join(" ")}</>;
}

function LocalCard({ patient }: { patient: PatientFormValues }) {
  return <section className="print-sheet"><h2>Hospital Clínico San Borja Arriarán</h2><h1><FullName patient={patient} /></h1><p>Identificador clínico: {patient.identifier}</p><p>Fecha de nacimiento: {patient.birthDate}</p></section>;
}

function StandardCard({ patient }: { patient: PatientFormValues }) {
  return <section className="print-sheet"><h2>Tarjeta de identificación de paciente</h2><dl><dt>Nombre</dt><dd><FullName patient={patient} /></dd><dt>Identificador</dt><dd>{patient.identifier}</dd><dt>Dirección</dt><dd>{[patient.address1, patient.cityVillage, patient.stateProvince].filter(Boolean).join(", ")}</dd></dl></section>;
}

function SupplementaryDocument({ patient }: { patient: PatientFormValues }) {
  return <section className="print-sheet"><h1>Documento de registro</h1><p>Paciente: <FullName patient={patient} /></p><p>Identificador: {patient.identifier}</p><p>Teléfono: {patient.phoneNumber}</p><p>Dirección: {[patient.address1, patient.address2, patient.cityVillage, patient.stateProvince, patient.country].filter(Boolean).join(", ")}</p></section>;
}

function BarcodeCard({ patient }: { patient: PatientFormValues }) {
  const barcode = encodeCode128(patient.identifier ?? "");
  const moduleWidth = 2;
  const margin = 10;
  const barHeight = 80;
  const textHeight = 28;
  if (!barcode) return <div role="alert" className="error-banner">El identificador no se puede representar como código CODE128.</div>;

  const width = barcode.modules * moduleWidth + margin * 2;
  const height = barHeight + textHeight + margin * 2;
  return <section className="print-sheet">
    <h2>Identificación HCSBA</h2>
    <p><FullName patient={patient} /></p>
    <svg role="img" aria-label={`Código de barras ${patient.identifier ?? ""}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <rect width={width} height={height} fill="#fff" />
      <g fill="#000" transform={`translate(${margin} ${margin})`}>
        {barcode.bars.map((bar) => <rect key={`${bar.x}-${bar.width}`} x={bar.x * moduleWidth} y={0} width={bar.width * moduleWidth} height={barHeight} />)}
      </g>
      <text x={width / 2} y={barHeight + margin + 20} textAnchor="middle" fontFamily="monospace" fontSize="18">{barcode.text}</text>
    </svg>
  </section>;
}

export function PatientPrint({ templateUrl, patient }: { templateUrl: string; patient: PatientFormValues }) {
  const normalized = templateUrl.replace(/\\/g, "/");
  if (normalized.endsWith("registrationCardLayout/print_local.html")) return <LocalCard patient={patient} />;
  if (normalized.endsWith("registrationCardLayout/print.html")) return <StandardCard patient={patient} />;
  if (normalized.endsWith("supplementalPaperLayout/print.html")) return <SupplementaryDocument patient={patient} />;
  if (normalized.endsWith("registrationCardLayout/printWithBarcode.html")) return <BarcodeCard patient={patient} />;
  return <div role="alert" className="error-banner">Template de impresión no soportado: {templateUrl}. No se ejecutó HTML remoto.</div>;
}
