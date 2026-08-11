import { z } from "zod";
import { bahmniRequest, queryString } from "./http";

const conceptNameSchema = z.object({ display: z.string().optional(), name: z.string().optional() }).loose();
const conceptMemberSchema = z.object({
  uuid: z.string(),
  display: z.string().optional(),
  names: z.array(conceptNameSchema).optional(),
}).loose();
const conceptSchema = z.object({
  setMembers: z.array(conceptMemberSchema).optional().default([]),
  answers: z.array(conceptMemberSchema).optional().default([]),
}).loose();

export const allergyConceptMapSchema = z.object({
  medicationAllergenUuid: z.string().min(1),
  foodAllergenUuid: z.string().min(1),
  environmentalAllergenUuid: z.string().min(1),
  allergyReactionUuid: z.string().min(1),
  allergySeverityUuid: z.string().min(1),
}).loose();

export type AllergyConceptMap = z.infer<typeof allergyConceptMapSchema>;
export type AllergenKind = "Drug" | "Food" | "Environment";

export interface AllergyOption {
  uuid: string;
  name: string;
}

export interface AllergenOption extends AllergyOption {
  kind: AllergenKind;
}

export interface AllergyCatalogs {
  allergens: AllergenOption[];
  reactions: AllergyOption[];
  severities: AllergyOption[];
}

export interface SaveAllergyInput {
  allergen: AllergenOption;
  reactionUuids: string[];
  severityUuid: string;
  comment?: string;
}

export interface SaveAllergyPayload {
  allergen: {
    allergenType: Uppercase<AllergenKind>;
    codedAllergen: { uuid: string };
  };
  reactions: Array<{ reaction: { uuid: string } }>;
  severity: { uuid: string };
  comment: string;
}

function displayName(member: z.infer<typeof conceptMemberSchema>): string {
  return member.names?.[0]?.display ?? member.names?.[0]?.name ?? member.display ?? member.uuid;
}

function withoutOtherNonCoded(members: z.infer<typeof conceptMemberSchema>[]) {
  return members.filter((member) => member.display !== "Other non-coded");
}

async function getConcept(uuid: string, locale: string) {
  return bahmniRequest(`/ws/rest/v1/concept/${encodeURIComponent(uuid)}${queryString({ v: "full", locale })}`, {
    schema: conceptSchema,
  });
}

export async function getAllergyCatalogs(map: AllergyConceptMap, locale: string): Promise<AllergyCatalogs> {
  const [medication, food, environment, reaction, severity] = await Promise.all([
    getConcept(map.medicationAllergenUuid, locale),
    getConcept(map.foodAllergenUuid, locale),
    getConcept(map.environmentalAllergenUuid, locale),
    getConcept(map.allergyReactionUuid, locale),
    getConcept(map.allergySeverityUuid, locale),
  ]);
  const allergensFor = (members: z.infer<typeof conceptMemberSchema>[], kind: AllergenKind): AllergenOption[] =>
    withoutOtherNonCoded(members).map((member) => ({ uuid: member.uuid, name: member.display ?? displayName(member), kind }));
  const severityMembers = severity.setMembers.length > 0 ? severity.setMembers : severity.answers;
  return {
    allergens: [
      ...allergensFor(medication.setMembers, "Drug"),
      ...allergensFor(environment.setMembers, "Environment"),
      ...allergensFor(food.setMembers, "Food"),
    ],
    reactions: withoutOtherNonCoded(reaction.setMembers).map((member) => ({ uuid: member.uuid, name: displayName(member) })),
    severities: severityMembers.map((member) => ({ uuid: member.uuid, name: member.display ?? displayName(member) })),
  };
}

export function buildSaveAllergyPayload(input: SaveAllergyInput): SaveAllergyPayload {
  return {
    allergen: {
      allergenType: input.allergen.kind.toUpperCase() as Uppercase<AllergenKind>,
      codedAllergen: { uuid: input.allergen.uuid },
    },
    reactions: input.reactionUuids.map((uuid) => ({ reaction: { uuid } })),
    severity: { uuid: input.severityUuid },
    comment: input.comment ?? "",
  };
}

export async function savePatientAllergy(patientUuid: string, input: SaveAllergyInput): Promise<unknown> {
  return bahmniRequest(`/ws/rest/v1/patient/${encodeURIComponent(patientUuid)}/allergy`, {
    method: "POST",
    body: JSON.stringify(buildSaveAllergyPayload(input)),
  });
}
