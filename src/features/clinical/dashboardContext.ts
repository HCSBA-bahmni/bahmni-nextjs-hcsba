import type { ClinicalDashboardSection, ClinicalDashboardTab } from "@/config-compat/clinicalConfig";
import type { BahmniLocation, BahmniProvider, BahmniUser, Visit } from "@/types/bahmni";
import type { ClinicalPatientContext } from "./patientContext";

export interface ClinicalDashboardContext {
  patient: ClinicalPatientContext;
  visit?: Visit;
  visits: Visit[];
  visitSummary?: Record<string, unknown>;
  enrollmentUuid?: string;
  user: BahmniUser | null;
  provider: BahmniProvider | null;
  location: BahmniLocation | null;
  locale: string;
  timeZone: string;
  privilegeNames: ReadonlySet<string>;
  tabs: ClinicalDashboardTab[];
}

export interface DashboardControlState {
  empty: boolean;
  settled: boolean;
}

export interface DashboardControlProps {
  section: ClinicalDashboardSection;
  context: ClinicalDashboardContext;
  expanded: boolean;
  reportState(state: DashboardControlState): void;
}
