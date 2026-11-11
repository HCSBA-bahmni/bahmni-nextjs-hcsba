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
  id: number;
  uuid: string;
  name: string;
  description: string;
}

export interface AdminBedTagMap {
  uuid: string;
  bedTag: { id: number; uuid: string; name: string };
}

export const BED_TAG_DESCRIPTION_SUGGESTIONS = [
  "Requiere aislamiento.",
  "Cuenta con suministro de oxígeno.",
  "Requiere medidas de contención.",
  "Destinada a paciente pediátrico.",
] as const;

export interface AdminBed {
  bedId: number;
  bedUuid: string;
  bedNumber: string;
  rowNumber: number;
  columnNumber: number;
  status: string;
  bedType?: { name?: string; displayName?: string };
  bedTagMaps: AdminBedTagMap[];
}

export interface AdminBedLayout {
  ward: AdminLocation;
  beds: AdminBed[];
  rows: number;
  columns: number;
}

export type BedComplexity = "critical_uti" | "critical_uci" | "medium" | "basic";

export interface BedComplexityDefinition {
  key: BedComplexity;
  name: string;
  displayName: string;
  persistedDisplayName: string;
  description: string;
  careProfile: string;
  usualUnits: string;
  cudyrReference: string;
  icon: string;
}

export const BED_COMPLEXITIES: readonly BedComplexityDefinition[] = [
  {
    key: "critical_uti",
    name: "MINSAL_CRITICA_UTI",
    displayName: "Cama crítica UTI",
    persistedDisplayName: "Crít. UTI",
    description: "Cama crítica de tratamiento intermedio.",
    careProfile: "Cuidados críticos de tratamiento intermedio y vigilancia continua.",
    usualUnits: "UTI",
    cudyrReference: "Referencia informativa: A1, A2 y A3.",
    icon: "pi-heart-fill",
  },
  {
    key: "critical_uci",
    name: "MINSAL_CRITICA_UCI",
    displayName: "Cama crítica UCI",
    persistedDisplayName: "Crít. UCI",
    description: "Cama crítica de cuidados intensivos.",
    careProfile: "Soporte vital, monitorización invasiva y cuidados intensivos continuos.",
    usualUnits: "UCI",
    cudyrReference: "Referencia informativa: A1, A2 y A3.",
    icon: "pi-heart-fill",
  },
  {
    key: "medium",
    name: "MINSAL_MEDIA",
    displayName: "Cama media",
    persistedDisplayName: "Media",
    description: "Cama de mediana complejidad, anteriormente denominada cama de agudos.",
    careProfile: "Vigilancia estrecha, administración frecuente de fármacos o cuidados de enfermería/matronería elevados.",
    usualUnits: "Medicina, Cirugía, Especialidades y Pediatría Aguda",
    cudyrReference: "Referencia informativa: B1, B2, B3, C1 y C2. C3 requiere confirmación normativa.",
    icon: "pi-wave-pulse",
  },
  {
    key: "basic",
    name: "MINSAL_BASICA",
    displayName: "Cama básica",
    persistedDisplayName: "Básica",
    description: "Cama para pacientes clínicamente estables y de bajo riesgo vital.",
    careProfile: "Reposo, tratamiento simple y cuidados de convalecencia o baja complejidad.",
    usualUnits: "Medicina/Cirugía básica y hospitalización de baja complejidad",
    cudyrReference: "Referencia informativa: D1, D2 y D3.",
    icon: "pi-shield",
  },
] as const;

function normalized(value: string | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

export function bedComplexityForType(type?: { name?: string; displayName?: string }): BedComplexity | undefined {
  const name = normalized(type?.name);
  const displayName = normalized(type?.displayName);
  const configured = BED_COMPLEXITIES.find((item) => item.name === name);
  if (configured) return configured.key;
  const combined = `${name} ${displayName}`;
  if (/\b(CRITICA|CRITICO)\b/.test(combined) && /\bUTI\b/.test(combined)) return "critical_uti";
  if (/\b(CRITICA|CRITICO)\b/.test(combined) && /\bUCI\b/.test(combined)) return "critical_uci";
  if (/\b(MEDIA|MEDIO|AGUDO|AGUDOS)\b/.test(combined)) return "medium";
  if (/\b(BASICA|BASICO)\b/.test(combined)) return "basic";
  return undefined;
}

export function bedComplexityDefinition(type?: { name?: string; displayName?: string }): BedComplexityDefinition | undefined {
  const complexity = bedComplexityForType(type);
  return BED_COMPLEXITIES.find((item) => item.key === complexity);
}
export function bedTypeVisibleName(type: { name: string; displayName?: string }): string {
  const complexity = bedComplexityDefinition(type);
  if (complexity) return complexity.displayName;
  if (normalized(type.name) === "MINSAL_CRITICA") return "Crítica sin especificar (anterior)";
  return type.displayName || type.name;
}

export function bedComplexityCounts(beds: AdminBed[]): Record<BedComplexity | "unclassified", number> {
  return beds.reduce<Record<BedComplexity | "unclassified", number>>((counts, bed) => {
    const complexity = bedComplexityForType(bed.bedType) ?? "unclassified";
    counts[complexity] += 1;
    return counts;
  }, { critical_uti: 0, critical_uci: 0, medium: 0, basic: 0, unclassified: 0 });
}

export type ComplementaryClassificationGroup = "age" | "specialUse" | "operational";
export interface ComplementaryBedClassification { group: ComplementaryClassificationGroup; name: string; label: string; description: string; }
export const COMPLEMENTARY_BED_CLASSIFICATIONS: readonly ComplementaryBedClassification[] = [
  { group: "age", name: "Clasificación: Adulto", label: "Adulto", description: "Cama destinada a pacientes adultos." },
  { group: "age", name: "Clasificación: Pediátrica", label: "Pediátrica", description: "Cama destinada a pacientes pediátricos." },
  { group: "age", name: "Clasificación: Neonatal", label: "Neonatal", description: "Cama destinada a pacientes neonatales." },
  { group: "specialUse", name: "Uso: Salud Mental", label: "Psiquiatría / Salud Mental", description: "Cama destinada a atención de salud mental." },
  { group: "specialUse", name: "Uso: Obstetricia", label: "Obstetricia / Ginecología", description: "Cama destinada a atención obstétrica o ginecológica." },
  { group: "specialUse", name: "Uso: Cuidados Paliativos", label: "Cuidados Paliativos", description: "Cama destinada a una unidad de cuidados paliativos." },
  { group: "operational", name: "Condición: Dotacional", label: "Dotacional / Diseñada", description: "Capacidad física autorizada de la unidad." },
  { group: "operational", name: "Condición: Habilitada", label: "Habilitada / Disponible", description: "Cama instalada y con personal asignado para funcionar." },
] as const;
export function complementaryClassificationForName(name: string): ComplementaryBedClassification | undefined { return COMPLEMENTARY_BED_CLASSIFICATIONS.find((item) => item.name === name); }

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
