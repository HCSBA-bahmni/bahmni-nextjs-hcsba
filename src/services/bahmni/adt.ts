import { z } from "zod";
import { bahmniRequest, queryString } from "./http";

const conceptName = z.union([z.string(), z.object({ name: z.string().optional(), display: z.string().optional() }).loose()]);
const conceptAnswer = z.object({
  uuid: z.string(), name: conceptName,
  mappings: z.array(z.object({ display: z.string().optional(), conceptReferenceTerm: z.object({ code: z.string().optional(), conceptSource: z.object({ name: z.string().optional() }).loose().optional() }).loose().optional() }).loose()).default([]),
}).loose();
const conceptResponse = z.object({ results: z.array(z.object({ answers: z.array(conceptAnswer).default([]) }).loose()) }).loose();

export interface DispositionActionConcept { uuid: string; label: string; code?: string }

function emrApiCode(answer: z.infer<typeof conceptAnswer>): string | undefined {
  for (const mapping of answer.mappings) {
    const term = mapping.conceptReferenceTerm;
    if (term?.conceptSource?.name === "org.openmrs.module.emrapi" && term.code) return term.code;
    const match = (mapping.display ?? "").match(/^org\.openmrs\.module\.emrapi:\s*(.+)$/);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export async function getDispositionActionConcepts(): Promise<DispositionActionConcept[]> {
  const response = await bahmniRequest(`/ws/rest/v1/concept${queryString({ s: "byFullySpecifiedName", name: "Disposition", v: "custom:(uuid,name,answers:(uuid,name,mappings:(display,conceptReferenceTerm:(code,conceptSource:(name))))" })}`, { schema: conceptResponse, cache: "no-store" });
  return (response.results[0]?.answers ?? []).map((answer) => ({ uuid: answer.uuid, label: typeof answer.name === "string" ? answer.name : answer.name.name ?? answer.name.display ?? answer.uuid, code: emrApiCode(answer) }));
}

export async function undoDischarge(encounterUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/bahmnicore/bahmniencounter/${encodeURIComponent(encounterUuid)}${queryString({ reason: "Undo Discharge" })}`, { method: "DELETE" });
}
