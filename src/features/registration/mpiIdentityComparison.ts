import type { IdentityCapabilities, IdentityPatient } from "@/services/mpi/localIdentity";

export interface ReviewDocument { code: string; label: string; value: string; country?: string; key: string }
const normalized = (value: string) => value.trim().normalize("NFKC").toUpperCase();

// These are display comparisons, never a replacement for OpenCR matching/adjudication.
export function reviewDocuments(patient: IdentityPatient, mapping: IdentityCapabilities["identifierMap"]): ReviewDocument[] {
  const result = new Map<string, ReviewDocument>();
  for (const identifier of patient.identifier || []) {
    if (identifier.system?.startsWith("urn:hcsba:mpi:") && !identifier.system.startsWith("urn:hcsba:mpi:document:")) continue;
    let code = identifier.type?.coding?.find(c => mapping.some(m => m.teiTypeCode === c.code))?.code;
    let value = identifier.value || "";
    let country = identifier.type?.extension?.find(e => e.url?.endsWith("/CodigoPaises"))?.valueCodeableConcept?.coding?.[0]?.code;
    if (identifier.system?.startsWith("urn:hcsba:mpi:document:")) {
      code = identifier.system.slice("urn:hcsba:mpi:document:".length);
      const separator = value.indexOf(":");
      if (separator >= 0) { country = value.slice(0, separator); value = value.slice(separator + 1); }
    }
    // Indexed domains determine the identity key. Do not reinterpret a RUN as a
    // passport because an older indexed resource retains a stale type annotation.
    if (identifier.system === "http://clientregistry.org/nationalid") { code = "01"; country = "152"; }
    const entry = mapping.find(m => m.teiTypeCode === code);
    if (!entry || !value) continue;
    country ||= entry.issuerCountryCode;
    const documentValue = code === "01" ? normalized(value).replace(/[.\s-]/g, "") : normalized(value);
    // An unknown country must not be treated as the same foreign document.
    const key = `${code}|${code === "01" ? "" : country || "?"}|${documentValue}`;
    result.set(key, { code: code!, label: entry.name, value, country, key });
  }
  return [...result.values()];
}

export function reviewName(patient: IdentityPatient) {
  const name = patient.name?.find(n => n.use !== "usual") || patient.name?.[0];
  const secondFamily = name?._family?.extension?.find(e => e.url?.endsWith("/SegundoApellido"))?.valueString;
  return { given: name?.given?.join(" ") || "", family: [name?.family, secondFamily].filter(Boolean).join(" ") };
}

export function comparisonState(left?: string, right?: string) {
  return !left || !right ? "unknown" : normalized(left) === normalized(right) ? "same" : "different";
}

export function documentOverlap(left: ReviewDocument[], right: ReviewDocument[]) {
  return left.filter(a => right.some(b => a.key === b.key && (a.code === "01" || Boolean(a.country && b.country))));
}

export function reviewDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value || "No informado";
}
