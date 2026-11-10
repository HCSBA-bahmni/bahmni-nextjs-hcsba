import type { PabellonItem } from "@/services/bahmni/pabellon";
/** Derive only from frozen DOB and capture date; never today's date/Persona. */
export function requestSnapshotAge(item: PabellonItem): string {
  const fields = item.request?.sections?.find(s => s.key === "patient")?.fields ?? [];
  const existing = fields.find(f => f.key === "age")?.value;
  if (existing) return existing;
  const birth = fields.find(f => f.key === "birth-date")?.value?.slice(0, 10);
  const capture = item.requestSnapshot.capturedAt?.rawValue.slice(0, 10);
  const parts = (date: string | undefined) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const value = new Date(Date.UTC(y, m - 1, d));
    return value.toISOString().slice(0, 10) === date ? { y, m, d, value } : null;
  };
  const b = parts(birth), c = parts(capture); if (!b || !c || c.value < b.value) return "";
  const years = c.y - b.y - (c.m < b.m || c.m === b.m && c.d < b.d ? 1 : 0);
  if (years > 0) return years + (years === 1 ? " año" : " años");
  const months = (c.y - b.y) * 12 + c.m - b.m - (c.d < b.d ? 1 : 0);
  if (months > 0) return "0 años y " + months + (months === 1 ? " mes" : " meses");
  const days = Math.floor((c.value.getTime() - b.value.getTime()) / 86400000);
  return "0 años, 0 meses y " + days + (days === 1 ? " día" : " días");
}
