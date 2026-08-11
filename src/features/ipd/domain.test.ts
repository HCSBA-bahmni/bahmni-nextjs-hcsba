import { describe, expect, it } from "vitest";
import { bedContainsPatient, bedHasOccupant, bedOccupantLabel, bedStatusLabel, buildBedGrid, buildRooms, canAssignBed, canChangeBedStatus, wardGridColumnCount } from "./domain";
import type { Bed } from "./types";

function bed(id: number, row: number, column: number, status: Bed["status"], location = "Room A"): Bed {
  return { bedId: id, bedUuid: `bed-${id}`, bedNumber: String(id), status, rowNumber: row, columnNumber: column, location, bedTagMaps: [], patients: [] };
}

describe("IPD bed layout", () => {
  it("preserves legacy coordinates and empty cells", () => {
    const grid = buildBedGrid([bed(1, 1, 1, "AVAILABLE"), bed(2, 2, 2, "OCCUPIED")]);
    expect(grid).toHaveLength(2);
    expect(grid[0]?.[1]).toBeNull();
    expect(grid[1]?.[1]?.bedId).toBe(2);
  });

  it("groups rooms and calculates every configured status", () => {
    const rooms = buildRooms([bed(1, 1, 1, "AVAILABLE"), bed(2, 1, 2, "OCCUPIED"), bed(3, 1, 1, "RESERVED", "Room B"), bed(4, 1, 2, "BLOCKED", "Room B")]);
    expect(rooms[0]).toMatchObject({ name: "Room A", totalBeds: 2, availableBeds: 1, occupiedBeds: 1 });
    expect(rooms[1]).toMatchObject({ name: "Room B", reservedBeds: 1, blockedBeds: 1 });
  });

  it("uses one visual column density for rooms with different bed counts", () => {
    const rooms = buildRooms([bed(1, 1, 1, "AVAILABLE"), bed(2, 1, 2, "OCCUPIED"), bed(3, 1, 3, "BLOCKED"), bed(4, 1, 1, "AVAILABLE", "Room B")]);
    expect(wardGridColumnCount(rooms)).toBe(3);
    expect(wardGridColumnCount([])).toBe(1);
  });

  it("allows assignment only to a truly empty AVAILABLE bed", () => {
    expect(canAssignBed(bed(1, 1, 1, "AVAILABLE"))).toBe(true);
    expect(canAssignBed({ ...bed(2, 1, 1, "AVAILABLE"), patient: { uuid: "patient" }, patients: [{ uuid: "patient" }] })).toBe(false);
    expect(canChangeBedStatus(bed(3, 1, 1, "RESERVED"))).toBe(true);
    expect(canChangeBedStatus({ ...bed(4, 1, 1, "OCCUPIED"), patient: { uuid: "patient" }, patients: [{ uuid: "patient" }] })).toBe(false);
  });

  it("matches the legacy ADT preflight by checking occupancy independently of status", () => {
    const statuslessIndividualRead = { ...bed(1, 1, 1, "BLOCKED"), patients: [], patient: undefined };
    expect(bedHasOccupant(statuslessIndividualRead)).toBe(false);
    expect(bedHasOccupant({ ...statuslessIndividualRead, patients: [{ uuid: "patient" }] })).toBe(true);
    expect(bedContainsPatient({ ...statuslessIndividualRead, patients: [{ uuid: "patient" }] }, "patient")).toBe(true);
  });

  it("shows the occupant name and falls back to the configured patient identifier", () => {
    expect(bedOccupantLabel({ uuid: "patient", name: "Nombre Paciente", identifiers: [{ identifier: "SYN-1" }] })).toBe("Nombre Paciente");
    expect(bedOccupantLabel({ uuid: "patient", identifiers: [{ identifier: "SYN-1" }] })).toBe("SYN-1");
  });

  it("presents configured OpenMRS bed statuses in clinical Spanish", () => {
    expect(bedStatusLabel("AVAILABLE")).toBe("Disponible");
    expect(bedStatusLabel("OCCUPIED")).toBe("Ocupada");
    expect(bedStatusLabel("RESERVED")).toBe("Reservada");
    expect(bedStatusLabel("BLOCKED")).toBe("Bloqueada");
  });
});
