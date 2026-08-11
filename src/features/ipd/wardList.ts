import { bedOccupantLabel, bedStatusLabel } from "./domain";
import type { Bed, BedStatus } from "./types";

export interface WardBedListRow {
  bedId: number;
  bedNumber: string;
  status: BedStatus;
  statusLabel: string;
  patientName: string;
  identifier: string;
  tags: string;
  configured: Record<string, unknown>;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configuredIdentity(row: Record<string, unknown>): { uuid?: string; identifier?: string } {
  const patient = record(row.patient);
  return {
    uuid: text(row.patientUuid) ?? text(row.uuid) ?? text(patient.uuid),
    identifier: text(row.identifier) ?? text(row.patientIdentifier) ?? text(patient.identifier),
  };
}

function bedIdentity(bed: Bed): { uuid?: string; identifier?: string } {
  const patient = bed.patient ?? bed.patients[0];
  return {
    uuid: patient?.uuid,
    identifier: patient?.identifier ?? patient?.identifiers?.find((item) => item.identifier)?.identifier,
  };
}

export function buildWardBedListRows(
  beds: Bed[],
  configuredRows: Record<string, unknown>[] = [],
): WardBedListRow[] {
  return beds.map((bed) => {
    const occupant = bed.patient ?? bed.patients[0];
    const identity = bedIdentity(bed);
    const configured = configuredRows.find((row) => {
      const candidate = configuredIdentity(row);
      return Boolean(
        (identity.uuid && candidate.uuid === identity.uuid)
        || (identity.identifier && candidate.identifier === identity.identifier),
      );
    }) ?? {};

    return {
      bedId: bed.bedId,
      bedNumber: bed.bedNumber,
      status: bed.status,
      statusLabel: bedStatusLabel(bed.status),
      patientName: bedOccupantLabel(occupant) ?? "",
      identifier: identity.identifier ?? "",
      tags: bed.bedTagMaps.map((map) => map.bedTag.name).filter(Boolean).join(", "),
      configured,
    };
  });
}

export function configuredWardListHeadings(
  rows: Record<string, unknown>[],
  ignoredHeadings: string[],
): string[] {
  const ignored = new Set(ignoredHeadings);
  const identityHeadings = new Set(["uuid", "patientUuid", "patientIdentifier", "identifier", "patient"]);
  const result: string[] = [];
  rows.forEach((row) => Object.keys(row).forEach((heading) => {
    if (!ignored.has(heading) && !identityHeadings.has(heading) && !result.includes(heading)) result.push(heading);
  }));
  return result;
}

export function wardListValue(row: WardBedListRow, key: string): unknown {
  if (key in row && key !== "configured") return row[key as keyof Omit<WardBedListRow, "configured">];
  return row.configured[key];
}

export function compareWardListValues(left: unknown, right: unknown, descending = false): number {
  const leftValue = left == null ? "" : String(left).trim();
  const rightValue = right == null ? "" : String(right).trim();
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  const result = leftValue.localeCompare(rightValue, "es", { numeric: true, sensitivity: "base" });
  return descending ? -result : result;
}
