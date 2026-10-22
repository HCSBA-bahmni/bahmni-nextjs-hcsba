/** Display only: the catalog UUID and coded values sent to OpenMRS are unchanged. */
export function patientCatalogLabel(display: string): string {
  const known = /^(?:Sexo biol[oó]gico EIS|Identidad de g[eé]nero EIS|Pa[ií]s ISO\s*3166-1|Previsi[oó]n (?:b[aá]sica )?EIS|Tipo de otro tel[eé]fono EIS)\s+\d+\s*[-–:]\s*/i;
  return display.replace(known, "").trim();
}
