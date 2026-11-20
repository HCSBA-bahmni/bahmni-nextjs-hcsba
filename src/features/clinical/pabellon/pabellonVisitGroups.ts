import type { PabellonItem } from "@/services/bahmni/pabellon";
import type { Visit } from "@/types/bahmni";

export interface PabellonVisitGroup { key: string; visit?: Visit; current: boolean; items: PabellonItem[] }

/** Only explicit visit UUIDs count as membership. Never match dates or names. */
export function groupPabellonVisits(items: PabellonItem[], visits: Visit[], selected?: Visit): PabellonVisitGroup[] {
  const known = new Map(visits.map(visit => [visit.uuid, visit]));
  if (selected) known.set(selected.uuid, selected);
  const current = selected && !selected.stopDatetime ? selected.uuid : [...known.values()].filter(visit => !visit.stopDatetime).sort((a, b) => b.startDatetime.localeCompare(a.startDatetime))[0]?.uuid;
  const groups = new Map<string, PabellonVisitGroup>();
  for (const item of items) {
    const key = item.care?.visitUuid ?? "unlinked";
    let group = groups.get(key);
    if (!group) { group = { key, visit: known.get(key), current: key === current, items: [] }; groups.set(key, group); }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => Number(b.current) - Number(a.current)
    || Number(a.key === "unlinked") - Number(b.key === "unlinked")
    || (b.visit?.startDatetime ?? "").localeCompare(a.visit?.startDatetime ?? "") || a.key.localeCompare(b.key));
}
