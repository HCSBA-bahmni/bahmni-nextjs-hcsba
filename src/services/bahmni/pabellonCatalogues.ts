import { z } from "zod";
import { bahmniRequest, BahmniApiError } from "./http";
import { PabellonReadError } from "./pabellon";

export const pabellonClinicalCatalogueNames = [
  "theatres", "specialties", "surgery-types", "care-types", "patient-priorities", "priority-types",
  "admission-services", "surgical-approaches", "procedures", "asa", "biopsy-types", "clinical-services",
  "preoperative-assessments", "blood-samples", "blood-groups", "prior-hospitalization-days",
  "approach-types", "destination-services", "priorities",
] as const;
export type PabellonClinicalCatalogueName = typeof pabellonClinicalCatalogueNames[number];
export const pabellonCatalogueNames = [...pabellonClinicalCatalogueNames, "communes", "insurances", "surgeons", "sexes"] as const;
export type PabellonCatalogueName = typeof pabellonCatalogueNames[number];
const name = z.enum(pabellonCatalogueNames);
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const text = z.string().min(1).max(6000).refine((v) => v.trim() === v && v.toUpperCase() !== "NULL" && !controls.test(v));
const id = z.string().regex(/^[1-9][0-9]{0,18}$/).refine((v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n);
const cursor = z.string().min(1).max(2048).refine((v) => !controls.test(v));
const reference = z.object({ sourceId: id, system: text, code: text, display: text.nullable() }).strict();
const option = z.object({
  sourceId: id, system: text, code: text, display: text, active: z.literal(true), relations: z.array(reference).max(1),
}).strict();
const page = z.object({
  catalogue: name, version: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(option).max(100), nextCursor: cursor.nullable(),
  observedAt: z.iso.datetime(), correlationId: z.uuid(),
}).strict();
export type PabellonCatalogueOption = z.infer<typeof option>;
export type PabellonCataloguePage = z.infer<typeof page>;
const querySchema = z.object({
  catalogue: name, limit: z.number().int().min(1).max(100),
  search: z.string().refine((v) => [...v].length <= 120 && !controls.test(v)), cursor: cursor.optional(),
}).strict();
const safeErrors = new Set(["SESSION_REQUIRED", "SURGERY_READ_FORBIDDEN", "SOURCE_TIMEOUT", "SOURCE_UNAVAILABLE", "SOURCE_CONTRACT_MISMATCH", "INVALID_CURSOR", "INVALID_FILTER"]);

export function validatePabellonCataloguePage(raw: unknown, catalogue: PabellonCatalogueName, limit = 100): PabellonCataloguePage {
  const parsed = page.safeParse(raw);
  const fail = () => { throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH"); };
  if (!parsed.success || !name.safeParse(catalogue).success || !Number.isInteger(limit) || limit < 1 || limit > 100) return fail();
  const data = parsed.data;
  if (data.catalogue !== catalogue || data.items.length > limit ||
      data.nextCursor !== null && data.items.length !== limit ||
      new Set(data.items.map((item) => item.sourceId)).size !== data.items.length) return fail();
  for (const item of data.items) {
    const domain = catalogue === "communes" || catalogue === "insurances" || catalogue === "sexes" ? "personas" : "pabellon";
    if (item.system !== "urn:hcsba:" + domain + ":catalogue:" + catalogue) return fail();
    if (catalogue === "approach-types") {
      if (item.relations.length !== 1 || item.relations[0]!.system !== "urn:hcsba:pabellon:catalogue:surgical-approaches" ||
          item.relations[0]!.code !== item.relations[0]!.sourceId || item.relations[0]!.display !== null) return fail();
    } else if (catalogue === "surgeons" || catalogue === "procedures") {
      const parent = catalogue === "surgeons" ? "specialties" : "surgery-types";
      if (item.relations.some((relation) => relation.system !== "urn:hcsba:pabellon:catalogue:" + parent || relation.code !== relation.sourceId || relation.display !== null)) return fail();
    } else if (item.relations.length !== 0) return fail();
  }
  return data;
}

/** Preserve the source's Spanish ordering; never merge different content versions. */
export function mergePabellonCataloguePages(pages: PabellonCataloguePage[]): PabellonCatalogueOption[] {
  const first = pages[0];
  if (first && pages.some((value, index) => value.catalogue !== first.catalogue || value.version !== first.version ||
      index < pages.length - 1 && value.nextCursor === null)) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  const items = pages.flatMap((value) => value.items);
  if (new Set(items.map((item) => item.sourceId)).size !== items.length) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
  return items;
}

export async function getPabellonCatalogue(catalogue: PabellonCatalogueName, options: {
  search?: string; cursor?: string; limit?: number; signal?: AbortSignal;
} = {}): Promise<PabellonCataloguePage> {
  const input = options.search ?? "";
  if (typeof input !== "string" || controls.test(input)) throw new PabellonReadError("INVALID_FILTER");
  const args = querySchema.safeParse({ catalogue, limit: options.limit ?? 20, search: input.trim().replace(/\s+/gu, " "), cursor: options.cursor });
  if (!args.success) throw new PabellonReadError("INVALID_FILTER");
  const query = new URLSearchParams({ limit: String(args.data.limit) });
  if (args.data.search) query.set("search", args.data.search);
  if (args.data.cursor) query.set("cursor", args.data.cursor);
  try {
    const raw = await bahmniRequest<unknown>("/pabellon-gateway/v1/catalogues/" + catalogue + "?" + query.toString(),
      { signal: options.signal, cache: "no-store", skipUnauthorizedEvent: true });
    return validatePabellonCataloguePage(raw, catalogue, args.data.limit);
  } catch (error) {
    if (error instanceof PabellonReadError || options.signal?.aborted) throw error;
    if (error instanceof BahmniApiError) {
      const candidate = error.payload && typeof error.payload === "object" ? (error.payload as Record<string, unknown>).code : undefined;
      const code = typeof candidate === "string" && safeErrors.has(candidate) ? candidate :
        error.status === 401 ? "SESSION_REQUIRED" : error.status === 403 ? "SURGERY_READ_FORBIDDEN" : "SOURCE_UNAVAILABLE";
      throw new PabellonReadError(code);
    }
    throw new PabellonReadError("SOURCE_UNAVAILABLE");
  }
}
