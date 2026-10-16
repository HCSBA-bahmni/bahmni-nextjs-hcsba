import { useQueries } from "@tanstack/react-query";
import { getConceptAnswers, type PersonAttributeType } from "@/services/bahmni/metadata";

const attributeName = (attribute: PersonAttributeType) => attribute.name ?? attribute.display ?? "";
export const PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS = 5 * 60 * 1000;

export function patientAttributeConceptUuids(attributeTypes: PersonAttributeType[]): string[] {
  return [...new Set(attributeTypes.flatMap((attribute) => attribute.concept?.uuid ? [attribute.concept.uuid] : []))];
}

export function requiredPatientAttributeConceptUuids(attributeTypes: PersonAttributeType[], requiredAttributeNames: string[]): string[] {
  const required = new Set(requiredAttributeNames);
  return [...new Set(attributeTypes.flatMap((attribute) => {
    const conceptUuid = attribute.concept?.uuid;
    return required.has(attributeName(attribute)) && conceptUuid ? [conceptUuid] : [];
  }))];
}

export function useRequiredPatientAttributeCatalogs(attributeTypes: PersonAttributeType[], requiredAttributeNames: string[]) {
  const conceptUuids = patientAttributeConceptUuids(attributeTypes);
  const requiredConceptUuids = new Set(requiredPatientAttributeConceptUuids(attributeTypes, requiredAttributeNames));
  const queries = useQueries({
    queries: conceptUuids.map((conceptUuid) => ({
      queryKey: ["concept-answers", conceptUuid],
      queryFn: () => getConceptAnswers(conceptUuid),
      staleTime: PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS,
    })),
  });
  const requiredQueries = queries.filter((_, index) => requiredConceptUuids.has(conceptUuids[index]!));
  return {
    isLoading: requiredQueries.some((query) => query.isPending),
    isError: requiredQueries.some((query) => query.isError),
  };
}
