import type { MfeManifestEntry } from "./types";

export const clinicalMfeManifest: MfeManifestEntry[] = [
  { sectionType: "allergies", legacyComponent: "PatientAlergiesControl", source: "next-ui/Containers/patientAlergies", status: "ported", notes: "Lectura FHIR R4 y alta REST portadas: catálogos configurados, búsqueda, reacciones múltiples, severidad, comentario y refresco selectivo." },
  { sectionType: "formsV2React", legacyComponent: "FormDisplayControl", source: "next-ui/Containers/formDisplayControl", status: "ported", notes: "Listado, permisos, lectura, edición, validación, impresión y auditoría portados al motor Form 2 React 19." },
  { sectionType: "ipsReact", legacyComponent: "IpsDisplayControl", source: "next-ui/Containers/ips", status: "partial", notes: "Integración OpenHIM diferida; permanece oculta salvo que NEXT_PUBLIC_IPS_ENABLED se active explícitamente." },
  { sectionType: "ipsIcvpReact", legacyComponent: "IpsIcvpDisplayControl", source: "next-ui/Containers/ipsIcvp", status: "partial", notes: "Integración OpenHIM diferida; permanece oculta salvo que NEXT_PUBLIC_IPS_ENABLED se active explícitamente." },
  { sectionType: "allOrdersReact", legacyComponent: "AllOrdersDashboard", source: "next-ui/Containers/AllOrders", status: "ported", notes: "Familias de órdenes, sección de indicaciones, filtro por visita, PDF individual/grupal y correo secuencial portados a React 19/PrimeReact; pendiente certificación E2E HCSBA." },
];

export const hostedClinicalMfeTypes = new Set(clinicalMfeManifest.filter((entry) => entry.status !== "pending" && entry.sectionType !== "allergies").map((entry) => entry.sectionType));

export function findClinicalMfe(sectionType: string): MfeManifestEntry | undefined {
  return clinicalMfeManifest.find((entry) => entry.sectionType === sectionType);
}
