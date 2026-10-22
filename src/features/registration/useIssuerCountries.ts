import { useQuery } from "@tanstack/react-query";
import { getConceptAnswers, getPersonAttributeTypes } from "@/services/bahmni/metadata";
import { PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS } from "./useRequiredPatientAttributeCatalogs";

/** Reuse the configured country catalog; display names without changing stored numeric codes. */
export function issuerCountryOption(display: string): { code: string; label: string } | undefined {
  const match = /^Pa[ií]s ISO\s*3166-1\s+(\d{3})\s*[-–:]\s*(.+)$/i.exec(display);
  return match ? { code: match[1]!, label: match[2]! } : undefined;
}
export function useIssuerCountries(enabled: boolean) {
  const attributes = useQuery({ queryKey: ["person-attribute-types"], queryFn: getPersonAttributeTypes, enabled, staleTime: PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS });
  const conceptUuid = attributes.data?.find(a => a.name === "countryOfOrigin")?.concept?.uuid;
  const answers = useQuery({ queryKey: ["concept-answers", conceptUuid], queryFn: () => getConceptAnswers(conceptUuid!), enabled: enabled && Boolean(conceptUuid), staleTime: PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS });
  return (answers.data || []).flatMap(a => { const option = issuerCountryOption(a.display || ""); return option ? [option] : []; });
}
