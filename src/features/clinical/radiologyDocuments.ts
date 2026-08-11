export type RadiologyRecord = Record<string, unknown>;
export interface RadiologyDocument { id: string; value: string; date?: string | number; comment: string; provider: string; visitUuid?: string; visitActive: boolean }
export interface RadiologyDocumentGroup { conceptName: string; documents: RadiologyDocument[] }

const record = (value: unknown): RadiologyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as RadiologyRecord : {};
const records = (value: unknown): RadiologyRecord[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const item = record(value); return text(item.display ?? item.name ?? item.value ?? item.uuid);
};
const time = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export function mapRadiologyDocuments(encounters: RadiologyRecord[], visitUuids?: string[]): RadiologyDocumentGroup[] {
  const groups = new Map<string, RadiologyDocument[]>();
  encounters.forEach((encounter) => {
    const visit = record(encounter.visit);
    const visitUuid = typeof visit.uuid === "string" ? visit.uuid : undefined;
    if (visitUuids?.length && (!visitUuid || !visitUuids.includes(visitUuid))) return;
    records(encounter.obs).forEach((parent) => {
      const concept = record(parent.concept); const conceptName = text(concept.name ?? concept.display) || "Documento de radiología";
      records(parent.groupMembers).forEach((member, index) => {
        const value = text(member.value);
        if (!value) return;
        const document: RadiologyDocument = {
          id: text(member.uuid ?? member.id) || `${text(encounter.uuid)}-${index}`,
          value,
          date: member.obsDatetime as string | number | undefined,
          comment: text(member.comment),
          provider: text(encounter.provider),
          visitUuid,
          visitActive: !visit.stopDatetime,
        };
        groups.set(conceptName, [...(groups.get(conceptName) ?? []), document]);
      });
    });
  });
  return [...groups.entries()].map(([conceptName, documents]) => ({ conceptName, documents: documents.sort((left, right) => time(right.date) - time(left.date) || right.id.localeCompare(left.id)) }));
}
