import { z } from "zod";
import { bahmniRequest, queryString } from "./http";
import { providerSchema, referenceSchema, type BahmniProvider, type Reference } from "@/types/bahmni";

const list = z.object({ results: z.array(referenceSchema) }).loose();
const attributeTypeSchema = referenceSchema.extend({
  format: z.string().nullish(),
  description: z.string().nullish(),
  sortWeight: z.number().nullish(),
  concept: referenceSchema.nullish(),
}).loose();
const attributeList = z.object({ results: z.array(attributeTypeSchema) }).loose();
const identifierSourceSchema = z.object({ uuid: z.string(), name: z.string().optional(), prefix: z.string().nullish() }).loose();
const identifierTypeSchema = referenceSchema.extend({
  description: z.string().nullish(), format: z.string().nullish(), formatDescription: z.string().nullish(), required: z.boolean().optional(),
  primary: z.boolean().optional(), identifierSources: z.array(identifierSourceSchema).default([]),
}).loose();
const identifierList = z.union([z.array(identifierTypeSchema), z.object({ results: z.array(identifierTypeSchema) }).loose()]);

export type PersonAttributeType = z.infer<typeof attributeTypeSchema>;
export type IdentifierType = z.infer<typeof identifierTypeSchema>;
export type IdentifierSource = z.infer<typeof identifierSourceSchema>;

export async function getIdentifierTypes(): Promise<IdentifierType[]> {
  const response = await bahmniRequest("/ws/rest/v1/idgen/identifiertype", { schema: identifierList });
  const results = Array.isArray(response) ? response : response.results;
  return results.map((type) => ({ ...type, display: type.display ?? type.name ?? type.uuid }));
}
export async function getRelationshipTypes(): Promise<Reference[]> { return (await bahmniRequest("/ws/rest/v1/relationshiptype?v=custom:(aIsToB,bIsToA,uuid,display,name)", { schema: list })).results.map((type) => ({ ...type, display: type.display ?? type.name ?? String(type.aIsToB ?? type.uuid) })); }
export async function getVisitTypes(): Promise<Reference[]> { return (await bahmniRequest("/ws/rest/v1/visittype?v=full", { schema: list })).results; }
export async function getVisitLocation(loginLocationUuid: string): Promise<Reference | null> {
  return await bahmniRequest(`/ws/rest/v1/bahmnicore/visitLocation/${encodeURIComponent(loginLocationUuid)}`, {
    schema: referenceSchema.nullable(),
  });
}
export async function getPersonAttributeTypes(): Promise<PersonAttributeType[]> { return (await bahmniRequest("/ws/rest/v1/personattributetype?v=custom:(uuid,name,display,sortWeight,description,format,concept:(uuid,display,name))", { schema: attributeList })).results; }
export async function searchPersons(q: string): Promise<Reference[]> { return (await bahmniRequest(`/ws/rest/v1/person${queryString({ q, v: "default", limit: 20 })}`, { schema: list })).results; }
export async function searchProviders(q: string): Promise<BahmniProvider[]> {
  const providerList = z.object({ results: z.array(providerSchema) }).loose();
  return (await bahmniRequest(`/ws/rest/v1/provider${queryString({ q, v: "default", limit: 20 })}`, { schema: providerList })).results;
}
export async function getConceptAnswers(uuid: string): Promise<Reference[]> {
  const concept = z.object({ answers: z.array(referenceSchema).default([]) }).loose();
  return (await bahmniRequest(`/ws/rest/v1/concept/${encodeURIComponent(uuid)}?v=custom:(answers:(uuid,display,name))`, { schema: concept })).answers;
}

const encounterConfig = z.object({ encounterTypes: z.record(z.string(), z.string()), visitTypes: z.record(z.string(), z.string()).default({}) }).loose();
export async function getEncounterConfiguration() { return await bahmniRequest(`/ws/rest/v1/bahmnicore/config/bahmniencounter${queryString({ callerContext: "REGISTRATION_CONCEPTS" })}`, { schema: encounterConfig }); }
const entityMappings = z.object({ results: z.array(z.object({ entity: referenceSchema, mappings: z.array(referenceSchema) }).loose()) }).loose();
export async function getLoginLocationVisitTypeMappings() { return (await bahmniRequest(`/ws/rest/v1/entitymapping${queryString({ mappingType: "loginlocation_visittype", s: "byEntityAndMappingType" })}`, { schema: entityMappings })).results; }
