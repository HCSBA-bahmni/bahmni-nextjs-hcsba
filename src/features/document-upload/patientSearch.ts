import type { AppExtension, BahmniUser, PatientSearchResult } from "@/types/bahmni";
import { hasPrivilege } from "@/services/bahmni/auth";

const patientSearchExtensionPoint = "org.bahmni.patient.search";

export interface DocumentUploadSearchTab {
  id: string;
  label: string;
  translationKey?: string;
  handler?: string;
  forwardUrl?: string;
  order: number;
}

function extensionParams(extension: AppExtension): Record<string, unknown> {
  const value = extension.extensionParams;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseDocumentUploadSearchTabs(extensions: AppExtension[], user: BahmniUser | null, requiredPrivilegeOverride?: string): DocumentUploadSearchTab[] {
  return extensions
    .filter((extension) => extension.extensionPointId === patientSearchExtensionPoint && extension.type === "config")
    .filter((extension) => hasPrivilege(user, requiredPrivilegeOverride ?? extension.requiredPrivilege))
    .map((extension) => {
      const params = extensionParams(extension);
      return {
        id: extension.id,
        label: optionalString(extension.label) ?? extension.id,
        translationKey: optionalString(params.translationKey) ?? optionalString(extension.translationKey),
        handler: optionalString(params.searchHandler),
        forwardUrl: optionalString(params.forwardUrl),
        order: extension.order ?? 0,
      } satisfies DocumentUploadSearchTab;
    });
}

export function filterDocumentUploadPatients(patients: PatientSearchResult[], query: string): PatientSearchResult[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return patients;
  return patients.filter((patient) => {
    const name = String(patient.name ?? [patient.givenName, patient.middleName, patient.familyName, patient.familyName2].filter(Boolean).join(" "));
    return [patient.display, name, patient.identifier].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
  });
}

export function documentUploadPatientDestination(tab: DocumentUploadSearchTab, patient: PatientSearchResult, query: { encounterType: string; topLevelConcept: string; defaultOption?: string }): string {
  const params = new URLSearchParams();
  params.set("encounterType", query.encounterType);
  params.set("topLevelConcept", query.topLevelConcept);
  if (query.defaultOption) params.set("defaultOption", query.defaultOption);
  const hash = (tab.forwardUrl ?? "#/patient/{{patientUuid}}/document").replace("{{patientUuid}}", encodeURIComponent(patient.uuid)).replace(/^#\/?/, "");
  return `/document-upload?${params.toString()}#/${hash}`;
}
