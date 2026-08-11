export interface GraphPoint { x: number; y: number; label: string; reference?: boolean }
export interface GraphReferenceLine { name: string; points: GraphPoint[] }

export function differenceInMonths(birthDate: string, referenceDate: string | number | Date = new Date()): number {
  const start = new Date(birthDate);
  const end = new Date(referenceDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) { years -= 1; months += 12; }
  return Number((years * 12 + months + days / 30).toFixed(3));
}

export function parseObservationGraphReference(csv: string, gender: string, ageInMonths: number): GraphReferenceLine[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(",").map((cell) => cell.trim()));
  const headers = rows.shift() ?? [];
  const ageIndex = headers.findIndex((header) => header.toLocaleLowerCase() === "age");
  const genderIndex = headers.findIndex((header) => header.toLocaleLowerCase() === "gender");
  if (ageIndex < 0) throw new Error("Age column is not defined in reference CSV");
  if (genderIndex < 0) throw new Error("Gender column is not defined in reference CSV");
  const matching = rows.filter((row) => row[genderIndex] === gender && Number(row[ageIndex]) <= ageInMonths + 1);
  return headers.flatMap((name, index) => index === ageIndex || index === genderIndex ? [] : [{
    name,
    points: matching.flatMap((row) => {
      const x = Number(row[ageIndex]); const y = Number(row[index]);
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y, label: name, reference: true }] : [];
    }),
  }]);
}
