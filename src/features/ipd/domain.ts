import type { Bed, BedOccupant, BedStatus, Room } from "./types";

export const BED_STATUSES: BedStatus[] = ["AVAILABLE", "OCCUPIED", "RESERVED", "BLOCKED"];

export const BED_STATUS_LABELS: Record<BedStatus, string> = {
  AVAILABLE: "Disponible",
  OCCUPIED: "Ocupada",
  RESERVED: "Reservada",
  BLOCKED: "Bloqueada",
};

export function bedStatusLabel(status: BedStatus): string {
  return BED_STATUS_LABELS[status];
}

export function normalizeBedStatus(value: unknown): BedStatus {
  return BED_STATUSES.includes(value as BedStatus) ? value as BedStatus : "BLOCKED";
}

export function buildBedGrid(beds: Bed[]): Array<Array<Bed | null>> {
  if (beds.length === 0) return [];
  const maxRow = Math.max(1, ...beds.map((bed) => bed.rowNumber || 1));
  const maxColumn = Math.max(1, ...beds.map((bed) => bed.columnNumber || 1));
  return Array.from({ length: maxRow }, (_, row) => Array.from({ length: maxColumn }, (_, column) =>
    beds.find((bed) => (bed.rowNumber || 1) === row + 1 && (bed.columnNumber || 1) === column + 1) ?? null));
}

export function buildRooms(beds: Bed[]): Room[] {
  const grouped = new Map<string, Bed[]>();
  beds.forEach((bed) => {
    const name = bed.location || bed.physicalLocation?.name || "Sin habitación";
    grouped.set(name, [...(grouped.get(name) ?? []), bed]);
  });
  return [...grouped.entries()].map(([name, roomBeds]) => ({
    name,
    beds: roomBeds,
    grid: buildBedGrid(roomBeds),
    totalBeds: roomBeds.length,
    availableBeds: roomBeds.filter((bed) => bed.status === "AVAILABLE").length,
    occupiedBeds: roomBeds.filter((bed) => bed.status === "OCCUPIED").length,
    reservedBeds: roomBeds.filter((bed) => bed.status === "RESERVED").length,
    blockedBeds: roomBeds.filter((bed) => bed.status === "BLOCKED").length,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export function wardGridColumnCount(rooms: Room[]): number {
  return Math.max(1, ...rooms.map((room) => room.grid[0]?.length ?? 1));
}

export function canChangeBedStatus(bed: Bed): boolean {
  return bed.patients.length === 0 && !bed.patient;
}

export function canAssignBed(bed: Bed): boolean {
  return bed.status === "AVAILABLE" && bed.patients.length === 0 && !bed.patient;
}

/** The legacy /beds/:id ADT preflight validates occupancy only. */
export function bedHasOccupant(bed: Pick<Bed, "patients" | "patient">): boolean {
  return bed.patients.length > 0 || Boolean(bed.patient);
}

export function bedContainsPatient(bed: Pick<Bed, "patients" | "patient"> | undefined, patientUuid: string): boolean {
  return Boolean(bed?.patient?.uuid === patientUuid || bed?.patients.some((patient) => patient.uuid === patientUuid));
}

export function bedOccupantLabel(patient: BedOccupant | undefined): string | undefined {
  if (!patient) return undefined;
  return patient.name ?? patient.display ?? patient.identifiers?.find((identifier) => identifier.identifier)?.identifier ?? patient.identifier;
}
