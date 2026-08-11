import type { DateTime } from "luxon";

export interface CareTeamParticipant {
  uuid?: string;
  providerUuid?: string;
  providerName?: string;
  startTime?: number;
  endTime?: number;
  voided?: boolean;
  [key: string]: unknown;
}

export interface CareViewPatient {
  uuid: string;
  visitUuid?: string;
  name: string;
  identifier?: string;
  bedNumber?: string;
  gender?: string;
  age?: number | string;
  admissionDate?: number;
  hasNewTreatments: boolean;
  careTeamParticipants: CareTeamParticipant[];
  extensions: Record<string, unknown>;
}

export interface CareViewPatientPage {
  patients: CareViewPatient[];
  totalCount: number;
}

export interface CareViewWardSummary {
  totalPatients: number;
  myPatients: number;
  extensions: Record<string, unknown>;
}

export type CareTaskKind = "medication" | "non-medication";
export type CareTaskStatus = "pending" | "administered" | "administered-late" | "missed" | "late" | "stopped";

export interface CareTask {
  uuid: string;
  patientUuid: string;
  kind: CareTaskKind;
  name: string;
  status: CareTaskStatus;
  rawStatus?: string;
  scheduledTime: number;
  completedTime?: number;
  dose?: string | number;
  doseUnit?: string;
  route?: string;
  creator?: string;
  extensions: Record<string, unknown>;
}

export type MedicationTask = CareTask & { kind: "medication" };

export interface CareTimeWindow {
  shiftId: string;
  shiftStart: DateTime;
  shiftEnd: DateTime;
  start: DateTime;
  end: DateTime;
  current: boolean;
}

export type CareTaskFilter = "all" | CareTaskKind;
