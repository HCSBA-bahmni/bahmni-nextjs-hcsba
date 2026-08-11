import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import type { ClinicalPatientContext } from "@/features/clinical/patientContext";
import type { BahmniLocation, BahmniProvider, BahmniUser, Visit } from "@/types/bahmni";

export interface BahmniMfeHostData {
  patientUuid: string;
  patient: ClinicalPatientContext;
  visitUuid?: string;
  visitIsActive: boolean;
  visits: Visit[];
  provider: BahmniProvider | null;
  currentUser: BahmniUser | null;
  location: BahmniLocation | null;
  locale: string;
  section: ClinicalDashboardSection;
  numberOfVisits?: number | string;
  showEditForActiveEncounter: boolean;
}

export interface BahmniMfeHostApi {
  refresh(): Promise<void>;
  navigate(href: string): Promise<void>;
  openExpanded(sectionId?: string): Promise<void>;
  print(): void;
  audit(eventType: string, message?: string): Promise<void>;
}

export interface BahmniMfeProps {
  hostData: BahmniMfeHostData;
  hostApi: BahmniMfeHostApi;
  tx(key: string, fallback?: string): string;
}

export type MfeMigrationStatus = "ported" | "partial" | "pending";

export interface MfeManifestEntry {
  sectionType: string;
  legacyComponent: string;
  source: string;
  status: MfeMigrationStatus;
  notes: string;
}
