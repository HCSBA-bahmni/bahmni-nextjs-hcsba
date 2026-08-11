import type { AppExtension, BahmniUser, PatientSearchResult } from "@/types/bahmni";
import { hasPrivilege } from "@/services/bahmni/auth";
import { normalizePatientSearchResult } from "@/services/bahmni/patients";

const clinicalSearchExtensionPoint = "org.bahmni.patient.search";

export interface ClinicalPatientSearchTab {
  id: string;
  label: string;
  translationKey?: string;
  handler?: string;
  forwardUrl?: string;
  view: "tile" | "tabular" | "custom";
  templateUrl?: string;
  additionalParams?: string;
  searchColumns: string[];
  order: number;
}

function extensionParams(extension: AppExtension): Record<string, unknown> {
  const value = extension.extensionParams;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseClinicalPatientSearchTabs(extensions: AppExtension[], user: BahmniUser | null): ClinicalPatientSearchTab[] {
  return extensions
    .filter((extension) => extension.extensionPointId === clinicalSearchExtensionPoint && extension.type === "config")
    .filter((extension) => hasPrivilege(user, extension.requiredPrivilege))
    .map((extension) => {
      const params = extensionParams(extension);
      const configuredView = optionalString(params.view);
      const searchColumns = Array.isArray(params.searchColumns)
        ? params.searchColumns.filter((item): item is string => typeof item === "string")
        : ["identifier", "name"];
      return {
        id: extension.id,
        label: optionalString(extension.label) ?? extension.id,
        translationKey: optionalString(params.translationKey) ?? optionalString(extension.translationKey),
        handler: optionalString(params.searchHandler),
        forwardUrl: optionalString(params.forwardUrl),
        view: configuredView === "tabular" || configuredView === "custom" ? configuredView : "tile",
        templateUrl: optionalString(params.templateUrl),
        additionalParams: optionalString(params.additionalParams),
        searchColumns: searchColumns.length > 0 ? searchColumns : ["identifier", "name"],
        order: extension.order ?? 0,
      } satisfies ClinicalPatientSearchTab;
    });
}

export function normalizeClinicalPatient(raw: Record<string, unknown>, searchColumns: string[] = ["identifier", "name"]): PatientSearchResult {
  const patient = normalizePatientSearchResult(raw);
  const name = String(raw.name ?? [patient.givenName, patient.middleName, patient.familyName].filter(Boolean).join(" ")).trim();
  const display = searchColumns.map((column) => column === "name" ? name : String(raw[column] ?? patient[column] ?? "")).join(" - ");
  return { ...patient, name, display };
}

export function filterClinicalPatients(patients: PatientSearchResult[], query: string): PatientSearchResult[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return patients;
  return patients.filter((patient) => String(patient.display ?? "").toLocaleLowerCase().includes(term));
}

export function clinicalPatientDestination(tab: ClinicalPatientSearchTab, patient: PatientSearchResult): string {
  const params = new URLSearchParams();
  if (patient.activeVisitUuid) params.set("visitUuid", patient.activeVisitUuid);
  if (tab.forwardUrl?.includes("consultationContext")) params.set("pending", "consultation");
  const query = params.toString();
  return `/clinical/patient/${encodeURIComponent(patient.uuid)}/dashboard${query ? `?${query}` : ""}`;
}
