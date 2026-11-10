import { format, parse } from "@formkit/tempo";
const missing = "—";
const invalid = "Fecha no válida";
const sourcePattern = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
function parts(value: string | null | undefined) {
  if (!value || value.startsWith("0001-01-01")) return null;
  const match = value.trim().match(sourcePattern);
  if (!match) throw new Error("INVALID_DATE");
  const [, day, hour, minute, second] = match;
  parse({ date: day + " 12:00:00", format: "YYYY-MM-DD HH:mm:ss", locale: "es", dateOverflow: "throw" });
  if (hour !== undefined && (+hour > 23 || +(minute ?? "0") > 59 || +(second ?? "0") > 59)) throw new Error("INVALID_TIME");
  return { day: day!, hour, minute: minute ?? "00", second: second ?? "00" };
}
/** A birthday is a calendar date: never shift its day using the browser zone. */
export function formatPabellonDate(value: string | null | undefined, pattern = "DD/MM/YYYY") {
  try { const p = parts(value); return p ? format({ date: p.day + "T12:00:00Z", format: pattern, locale: "es", tz: "UTC" }) : missing; }
  catch { return invalid; }
}
/** Same wall-clock semantics as Pabellon's format(parse(raw,...),...).
 * Legacy source timestamps may append Z to local clinical time. Preserve their
 * recorded clock; UTC here is only a formatting carrier, not source metadata. */
export function formatPabellonDateTime(value: string | null | undefined) {
  try {
    const p = parts(value); if (!p) return missing;
    if (p.hour === undefined) return formatPabellonDate(p.day, "DD-MM-YYYY");
    return format({ date: `${p.day}T${p.hour}:${p.minute}:${p.second}Z`, format: "DD-MM-YYYY HH:mm", locale: "es", tz: "UTC" });
  } catch { return invalid; }
}
/** OpenMRS visit timestamps are actual instants, unlike legacy clinical clocks. */
export function formatPabellonVisit(value: string | null | undefined, timeZone = "America/Santiago") {
  if (!value) return missing;
  try {
    if (!parts(value)) return missing;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return formatPabellonDateTime(value);
    const date = value.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return format({ date, format: "DD-MM-YYYY HH:mm", locale: "es", tz: timeZone });
  } catch { return invalid; }
}
export const formatPabellonSourceDate = (value: { rawValue: string } | null | undefined) => formatPabellonDateTime(value?.rawValue);
