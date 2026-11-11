import { describe, expect, it } from "vitest";
import { BED_COMPLEXITIES, bedComplexityCounts, bedComplexityForType, layoutCellKey, locationChildren, validateBedPosition, validateLayout, type AdminLocation } from "./beds";

const locations: AdminLocation[] = [
  { uuid: "root", name: "Urgencia", description: "", parentUuid: "hospital" },
  { uuid: "ward", name: "Sala Urgencia", description: "", parentUuid: "root" },
];

describe("dominio administrativo de camas", () => {
  it("construye raíces y salas sin inventar niveles", () => {
    expect(locationChildren(locations).map((item) => item.uuid)).toEqual(["root"]);
    expect(locationChildren(locations, "root").map((item) => item.uuid)).toEqual(["ward"]);
  });

  it("conserva literalmente los nombres definidos por el implementador", () => {
    const configured = [{ uuid: "custom", name: "Emergency Ward - HCSBA", description: "", parentUuid: "root" }];
    expect(locationChildren(configured, "root")[0]?.name).toBe("Emergency Ward - HCSBA");
  });

  it("reconoce las cuatro complejidades por nombre estable o visible", () => {
    expect(bedComplexityForType({ name: "MINSAL_CRITICA_UTI", displayName: "Crítica UTI" })).toBe("critical_uti");
    expect(bedComplexityForType({ name: "MINSAL_CRITICA_UCI", displayName: "Crítica UCI" })).toBe("critical_uci");
    expect(bedComplexityForType({ name: "Cama de agudos" })).toBe("medium");
    expect(bedComplexityForType({ displayName: "Cama básica" })).toBe("basic");
    expect(bedComplexityForType({ name: "Cama estándar" })).toBeUndefined();
  });

  it("usa nombres persistentes compatibles con el límite de bed_type", () => {
    expect(BED_COMPLEXITIES.map((type) => type.persistedDisplayName)).toEqual(["Crít. UTI", "Crít. UCI", "Media", "Básica"]);
    expect(BED_COMPLEXITIES.every((type) => type.persistedDisplayName.length <= 10)).toBe(true);
  });

  it("resume camas clasificadas y mantiene visibles las pendientes", () => {
    expect(bedComplexityCounts([
      { bedId: 1, bedUuid: "1", bedNumber: "1", rowNumber: 1, columnNumber: 1, status: "AVAILABLE", bedType: { name: "MINSAL_CRITICA_UTI" }, bedTagMaps: [] },
      { bedId: 2, bedUuid: "2", bedNumber: "2", rowNumber: 1, columnNumber: 2, status: "AVAILABLE", bedType: { displayName: "Cama media" }, bedTagMaps: [] },
      { bedId: 3, bedUuid: "3", bedNumber: "3", rowNumber: 1, columnNumber: 3, status: "AVAILABLE", bedType: { name: "General" }, bedTagMaps: [] },
    ])).toEqual({ critical_uti: 1, critical_uci: 0, medium: 1, basic: 0, unclassified: 1 });
  });

  it("conserva la clave fila:columna del layout OWA", () => expect(layoutCellKey(2, 3)).toBe("2:3"));

  it("aplica los límites del OWA para layout y posición", () => {
    expect(validateLayout(0, 11)).toEqual({ rows: "Las filas deben ser mayores que 0.", columns: "Las columnas deben ser mayores que 0 y menores que 11." });
    expect(validateBedPosition(4, 3, 2, 2)).toEqual({ row: "La fila no puede superar el tamaño de la distribución.", column: "La columna no puede superar el tamaño de la distribución." });
  });
});
