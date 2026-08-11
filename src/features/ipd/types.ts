export type BedStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "BLOCKED";

export interface IpdReference {
  uuid: string;
  display?: string;
  name?: string;
  [key: string]: unknown;
}

export interface BedTag {
  id?: number;
  uuid: string;
  name: string;
  display?: string;
  [key: string]: unknown;
}

export interface BedTagMap {
  uuid?: string;
  bedTag: BedTag;
  [key: string]: unknown;
}

export interface BedOccupant extends IpdReference {
  identifier?: string;
  identifiers?: Array<{ identifier?: string }>;
  person?: Record<string, unknown>;
}

export interface Bed {
  bedId: number;
  bedUuid: string;
  bedNumber: string;
  status: BedStatus;
  rowNumber: number;
  columnNumber: number;
  location: string;
  physicalLocation?: IpdReference & { parentLocation?: IpdReference };
  bedType?: { displayName?: string; name?: string } | null;
  bedTagMaps: BedTagMap[];
  patients: BedOccupant[];
  patient?: BedOccupant;
  [key: string]: unknown;
}

export interface Room {
  name: string;
  beds: Bed[];
  grid: Array<Array<Bed | null>>;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  blockedBeds: number;
}

export interface WardSummary {
  ward: IpdReference;
  [key: string]: unknown;
}

export interface Ward extends IpdReference {
  beds: Bed[];
  rooms: Room[];
}

export interface AssignedBed {
  wardName?: string;
  wardUuid?: string;
  roomName?: string;
  bedNumber?: string;
  bedId?: number;
  bedUuid?: string;
}

export interface IpdQueue {
  id: string;
  label: string;
  translationKey?: string;
  handler?: string;
  forwardUrl?: string;
  additionalParams?: string;
  searchColumns: string[];
  order: number;
  requiredPrivilege?: string | string[];
}

export interface IpdDashboardSection {
  id: string;
  type: string;
  translationKey?: string;
  displayOrder: number;
  requiredPrivilege?: string | string[];
  dashboardConfig?: Record<string, unknown>;
  expandedViewConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IpdConfig {
  wardListPrintEnabled: boolean;
  wardListPrintViewTemplateUrl?: string;
  wardListPrintAttributes: string[];
  wardListSqlSearchHandler?: string;
  ignoredTabularViewHeadings: string[];
  diagnosisStatus?: string;
  defaultVisitType?: string;
  enableIPDFeature: boolean;
  expectedDateOfDischarge?: string;
  hideStartNewVisitPopUp: boolean;
  enableAutoConvertToIPDVisit: boolean;
  patientForwardUrl?: string;
  oirsApiBaseUrl?: string;
  dashboard: {
    translationKey?: string;
    conceptName?: string;
    sections: IpdDashboardSection[];
  };
  extensions: Record<string, unknown>;
}
