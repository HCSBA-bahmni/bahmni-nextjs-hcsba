import { getPabellonCatalogue, mergePabellonCataloguePages, type PabellonCataloguePage } from "@/services/bahmni/pabellonCatalogues";
import { PabellonReadError } from "@/services/bahmni/pabellon";
/** Bounded original small masters; never use this for the MAI catalogue. */
export async function loadPabellonSmallCatalogue(group: "patient-priorities" | "approach-types" | "communes" | "insurances" | "sexes" | "preoperative-assessments" | "blood-samples" | "theatres" | "care-types" | "specialties" | "surgery-types", signal?: AbortSignal) {
  const pages: PabellonCataloguePage[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 20; index++) {
    const page = await getPabellonCatalogue(group, { cursor: pages.at(-1)?.nextCursor ?? undefined, limit: 100, signal });
    if (page.catalogue !== group) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
    pages.push(page);
    const items = mergePabellonCataloguePages(pages);
    if (!page.nextCursor) return items;
    if (seen.has(page.nextCursor)) throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
    seen.add(page.nextCursor);
  }
  throw new PabellonReadError("SOURCE_CONTRACT_MISMATCH");
}
