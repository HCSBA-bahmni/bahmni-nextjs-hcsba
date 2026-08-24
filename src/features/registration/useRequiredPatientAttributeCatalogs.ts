import { useQueries } from "@tanstack/react-query";
import { getConceptAnswers, type PersonAttributeType } from "@/services/bahmni/metadata";

const attributeName = (attribute: PersonAttributeType) => attribute.name ?? attribute.display ?? "";

export function requiredPatientAttributeConceptUuids(attributeTypes: PersonAttributeType[], requiredAttributeNames: string[]): string[] {
  const required = new Set(requiredAttributeNames);
  return [...new Set(attributeTypes.flatMap((attribute) => {
    const conceptUuid = attribute.concept?.uuid;
    return required.has(attributeName(attribute)) && conceptUuid ? [conceptUuid] : [];
  }))];
}

export function useRequiredPatientAttributeCatalogs(attributeTypes: PersonAttributeType[], requiredAttributeNames: string[]) {
  const conceptUuids = requiredPatientAttributeConceptUuids(attributeTypes, requiredAttributeNames);
  const queries = useQueries({
    queries: conceptUuids.map((conceptUuid) => ({
      queryKey: ["concept-answers", conceptUuid],
      queryFn: () => getConceptAnswers(conceptUuid),
    })),
  });
  return {
    isLoading: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
  };
}
