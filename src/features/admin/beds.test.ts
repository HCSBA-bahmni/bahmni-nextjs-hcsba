import { describe, expect, it } from "vitest";
import { layoutCellKey, locationChildren, validateBedPosition, validateLayout, type AdminLocation } from "./beds";

const locations: AdminLocation[] = [
  { uuid: "root", name: "Urgencia", description: "", parentUuid: "hospital" },
  { uuid: "ward", name: "Sala Urgencia", description: "", parentUuid: "root" },
];

describe("dominio administrativo de camas", () => {
  it("construye raíces y salas sin inventar niveles", () => {
    expect(locationChildren(locations).map((item) => item.uuid)).toEqual(["root"]);
    expect(locationChildren(locations, "root").map((item) => item.uuid)).toEqual(["ward"]);
  });

  it("conserva la clave fila:columna del layout OWA", () => expect(layoutCellKey(2, 3)).toBe("2:3"));

  it("aplica los límites del OWA para layout y posición", () => {
    expect(validateLayout(0, 11)).toEqual({ rows: "Las filas deben ser mayores que 0.", columns: "Las columnas deben ser mayores que 0 y menores que 11." });
    expect(validateBedPosition(4, 3, 2, 2)).toEqual({ row: "La fila no puede superar el tamaño de la distribución.", column: "La columna no puede superar el tamaño de la distribución." });
  });
});
