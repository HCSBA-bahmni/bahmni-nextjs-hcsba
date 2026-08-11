import type { MfeManifestEntry } from "./types";

export const clinicalMfeManifest: MfeManifestEntry[] = [
  { sectionType: "allergies", legacyComponent: "PatientAlergiesControl", source: "next-ui/Containers/patientAlergies", status: "ported", notes: "Lectura FHIR R4 y alta REST portadas: catálogos configurados, búsqueda, reacciones múltiples, severidad, comentario y refresco selectivo." },
  { sectionType: "formsV2React", legacyComponent: "FormDisplayControl", source: "next-ui/Containers/formDisplayControl", status: "ported", notes: "Listado, permisos, lectura, edición, validación, impresión y auditoría portados al motor Form 2 React 19." },
  { sectionType: "ipsReact", legacyComponent: "IpsDisplayControl", source: "next-ui/Containers/ips", status: "partial", notes: "ITI-67/68, VHL, QR, descarga y resolución portados; requiere mediador same-origin y certificación E2E." },
  { sectionType: "ipsIcvpReact", legacyComponent: "IpsIcvpDisplayControl", source: "next-ui/Containers/ipsIcvp", status: "partial", notes: "ITI-67/68 y generación ICVP/HC1 portados; decodificación local/cámara quedan pendientes de certificación." },
  { sectionType: "allOrdersReact", legacyComponent: "AllOrdersDashboard", source: "next-ui/Containers/AllOrders", status: "partial", notes: "Familias de órdenes, sección de indicaciones, filtro por visita, PDF individual/grupal y correo secuencial portados a React 19/PrimeReact; pendiente certificación E2E." },
];

export const hostedClinicalMfeTypes = new Set(clinicalMfeManifest.filter((entry) => entry.status !== "pending" && entry.sectionType !== "allergies").map((entry) => entry.sectionType));

export function findClinicalMfe(sectionType: string): MfeManifestEntry | undefined {
  return clinicalMfeManifest.find((entry) => entry.sectionType === sectionType);
}
