import type { ClinicalRecord } from "@/services/bahmni/clinical";

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";

function codingDisplay(value: unknown): string {
  const codeable = asRecord(value);
  return text(asRecords(codeable.coding)[0]?.display ?? codeable.text);
}

function statusCode(value: unknown): string {
  return text(asRecords(asRecord(value).coding)[0]?.code ?? asRecord(value).text);
}

export interface AllergyDashboardRecord {
  id: string;
  allergen: string;
  reactions: string[];
  severity: string;
  comment?: string;
  provider?: string;
  recordedDate?: string;
  clinicalStatus?: string;
  criticality?: string;
  category: string[];
  type?: string;
}

const severityRank: Record<string, number> = { severe: 0, moderate: 1, mild: 2 };

export function mapAllergyIntolerances(resources: ClinicalRecord[]): AllergyDashboardRecord[] {
  return resources.map((resource, index) => {
    const reactions = asRecords(resource.reaction);
    const primaryReaction = reactions[0] ?? {};
    const allergen = codingDisplay(primaryReaction.substance) || codingDisplay(resource.code) || "Alérgeno sin nombre";
    const manifestations = reactions.flatMap((reaction) => asRecords(reaction.manifestation).map(codingDisplay).filter(Boolean));
    const notes = asRecords(resource.note).map((note) => text(note.text)).filter(Boolean);
    return {
      id: text(resource.id ?? resource.uuid) || `allergy-${index}`,
      allergen,
      reactions: [...new Set(manifestations)],
      severity: text(primaryReaction.severity ?? resource.criticality),
      comment: notes.length ? notes.join("\n") : undefined,
      provider: text(asRecord(resource.recorder).display),
      recordedDate: text(resource.recordedDate),
      clinicalStatus: statusCode(resource.clinicalStatus),
      criticality: text(resource.criticality),
      category: Array.isArray(resource.category) ? resource.category.map(text).filter(Boolean) : [],
      type: text(resource.type),
    };
  }).sort((a, b) => {
    const rank = (severityRank[a.severity.toLowerCase()] ?? 3) - (severityRank[b.severity.toLowerCase()] ?? 3);
    if (rank !== 0) return rank;
    return new Date(b.recordedDate ?? 0).getTime() - new Date(a.recordedDate ?? 0).getTime();
  });
}
