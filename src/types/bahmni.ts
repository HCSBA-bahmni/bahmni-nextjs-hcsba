import { z } from "zod";

export const referenceSchema = z.object({ uuid: z.string(), display: z.string().optional(), name: z.string().optional() }).loose();
export type Reference = z.infer<typeof referenceSchema>;

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  sessionId: z.string().optional(),
  user: referenceSchema.optional(),
  sessionLocation: referenceSchema.nullish(),
}).loose();
export type BahmniSession = z.infer<typeof sessionSchema>;

const userMembershipSchema = referenceSchema.extend({
  uuid: z.string().optional(),
  retired: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
}).loose();

export const userSchema = z.object({
  uuid: z.string(), username: z.string().optional(), display: z.string().optional(),
  person: referenceSchema.optional(),
  privileges: z.array(userMembershipSchema).default([]), roles: z.array(userMembershipSchema).default([]),
  userProperties: z.record(z.string(), z.string()).optional(),
}).loose();
export type BahmniUser = z.infer<typeof userSchema>;

export const locationSchema = referenceSchema.extend({
  attributes: z.array(z.object({ attributeType: referenceSchema.optional(), value: z.unknown() }).loose()).optional(),
}).loose();
export type BahmniLocation = z.infer<typeof locationSchema>;

export const providerSchema = z.object({
  uuid: z.string(), display: z.string().optional(), identifier: z.string().optional(),
  retired: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  attributes: z.array(z.object({ attributeType: referenceSchema, value: z.union([referenceSchema, z.string(), z.number(), z.boolean()]) }).loose()).default([]),
}).loose();
export type BahmniProvider = z.infer<typeof providerSchema>;

export interface AppExtension {
  id: string;
  extensionPointId?: string;
  type?: string;
  order?: number;
  label?: string;
  translationKey?: string;
  url?: string;
  icon?: string;
  requiredPrivilege?: string | string[];
  offline?: boolean;
  online?: boolean;
  [key: string]: unknown;
}

export interface PatientSearchResult {
  uuid: string;
  identifier?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  familyName2?: string;
  gender?: string;
  age?: number | string;
  birthDate?: string;
  phoneNumber?: string;
  address?: string;
  activeVisitUuid?: string;
  [key: string]: unknown;
}

export interface PatientFormValues {
  uuid?: string;
  nameUuid?: string;
  addressUuid?: string;
  identifierUuid?: string;
  givenName: string;
  middleName?: string;
  familyName: string;
  familyName2?: string;
  gender: string;
  birthDate?: string;
  birthDateEstimated?: boolean;
  ageYears?: number;
  ageMonths?: number;
  ageDays?: number;
  birthTime?: string;
  identifier?: string;
  identifierTypeUuid?: string;
  identifierSourceUuid?: string;
  identifierPrefix?: string;
  identifierSuffix?: string;
  additionalIdentifiers?: Array<{
    uuid?: string;
    identifier?: string;
    identifierTypeUuid: string;
    identifierSourceUuid?: string;
    identifierPrefix?: string;
    identifierSuffix?: string;
    voided?: boolean;
    metadata?: PatientIdentifierMetadataValues;
  }>;
  locationUuid?: string;
  phoneNumber?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  address6?: string;
  cityVillage?: string;
  stateProvince?: string;
  countyDistrict?: string;
  country?: string;
  postalCode?: string;
  dead?: boolean;
  deathDate?: string;
  causeOfDeathUuid?: string;
  attributes: Record<string, unknown>;
  attributeUuids?: Record<string, string>;
  relationships: Array<{ relationshipTypeUuid: string; personUuid: string; personDisplay?: string; relationshipUuid?: string; voided?: boolean }>;
  image?: string;
}

export interface PatientIdentifierMetadataValues {
  typeCode: string;
  use: string;
  systemUri?: string;
  issuerCountryCode?: string;
  issuerOrganization?: string;
  documentType?: string;
  validFrom?: string;
  validTo?: string;
}

export interface Visit {
  uuid: string;
  startDatetime: string;
  stopDatetime?: string | null;
  visitType?: Reference;
  location?: Reference;
  patient?: Reference;
  [key: string]: unknown;
}
