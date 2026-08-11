import { DateTime } from "luxon";

export interface PatientAge {
  years: number;
  months: number;
  days: number;
}
export function ageFromBirthDate(birthDate: string, reference: DateTime<boolean> = DateTime.local()): PatientAge | undefined {
  const birth = DateTime.fromISO(birthDate).startOf("day");
  const today = reference.startOf("day");
  if (!birth.isValid || birth > today) return undefined;

  let years = today.year - birth.year;
  if (birth.plus({ years }) > today) years -= 1;
  let cursor = birth.plus({ years });

  let months = (today.year - cursor.year) * 12 + today.month - cursor.month;
  if (cursor.plus({ months }) > today) months -= 1;
  cursor = cursor.plus({ months });

  return { years, months, days: Math.floor(today.diff(cursor, "days").days) };
}

export function birthDateFromAge(age: Partial<PatientAge>, reference: DateTime<boolean> = DateTime.local()): string {
  const birthDate = reference.startOf("day")
    .minus({ days: age.days ?? 0 })
    .minus({ months: age.months ?? 0 })
    .minus({ years: age.years ?? 0 });
  return birthDate.toISODate() ?? "";
}
