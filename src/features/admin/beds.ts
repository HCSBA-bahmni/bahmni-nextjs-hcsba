export interface AdminLocation {
  uuid: string;
  name: string;
  description: string;
  parentUuid?: string;
}

export interface AdminBedType {
  uuid: string;
  name: string;
  displayName: string;
  description: string;
}

export interface AdminBedTag {
  uuid: string;
  name: string;
}

export interface AdminBed {
  bedUuid: string;
  bedNumber: string;
  rowNumber: number;
  columnNumber: number;
  status: string;
  bedType?: { name?: string; displayName?: string };
}

export interface AdminBedLayout {
  ward: AdminLocation;
  beds: AdminBed[];
  rows: number;
  columns: number;
}

export function locationChildren(locations: AdminLocation[], parentUuid?: string): AdminLocation[] {
  const ids = new Set(locations.map((location) => location.uuid));
  return locations.filter((location) => parentUuid
    ? location.parentUuid === parentUuid
    : !location.parentUuid || !ids.has(location.parentUuid));
}

export function layoutCellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function validateLayout(rows: number, columns: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isFinite(rows) || rows < 1) errors.rows = "Las filas deben ser mayores que 0.";
  if (!Number.isFinite(columns) || columns < 1 || columns > 10) errors.columns = "Las columnas deben ser mayores que 0 y menores que 11.";
  return errors;
}

export function validateBedPosition(row: number, column: number, rows: number, columns: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isFinite(row) || row < 1) errors.row = "La fila debe ser mayor que 0.";
  else if (row > rows) errors.row = "La fila no puede superar el tamaño de la distribución.";
  if (!Number.isFinite(column) || column < 1) errors.column = "La columna debe ser mayor que 0.";
  else if (column > columns) errors.column = "La columna no puede superar el tamaño de la distribución.";
  return errors;
}
