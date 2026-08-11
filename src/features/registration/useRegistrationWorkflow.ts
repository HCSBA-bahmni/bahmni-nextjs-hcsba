import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { RegistrationConfig } from "@/config-compat/registrationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadExtensions } from "@/services/bahmni/config";
import { getLoginLocationVisitTypeMappings, getVisitLocation, getVisitTypes } from "@/services/bahmni/metadata";
import { getActiveVisits } from "@/services/bahmni/visits";
import type { AppExtension } from "@/types/bahmni";
import { resolveRegistrationWorkflow } from "./workflow";

function extensionAllowed(extension: AppExtension, user: ReturnType<typeof useAuth>["user"]): boolean {
  return hasPrivilege(user, extension.requiredPrivilege);
}

export function useRegistrationWorkflow(patientUuid: string | undefined, config: RegistrationConfig | undefined) {
  const { location, user } = useAuth();
  const [selectedVisitTypeUuid, setSelectedVisitTypeUuid] = useState("");
  const visits = useQuery({ queryKey: ["active-visits", patientUuid], queryFn: () => getActiveVisits(patientUuid!), enabled: Boolean(patientUuid) });
  const visitLocation = useQuery({
    queryKey: ["visit-location", location?.uuid],
    queryFn: () => getVisitLocation(location!.uuid),
    enabled: Boolean(location?.uuid),
  });
  const visitTypes = useQuery({ queryKey: ["visit-types"], queryFn: getVisitTypes });
  const mappings = useQuery({ queryKey: ["login-location-visit-types"], queryFn: getLoginLocationVisitTypeMappings });
  const extensions = useQuery({ queryKey: ["extensions", "registration"], queryFn: () => loadExtensions("registration") });

  const activeVisit = (visits.data ?? []).find((visit) => visit.location?.uuid === visitLocation.data?.uuid);
  const mappedTypeName = mappings.data?.find((mapping) => mapping.entity.uuid === location?.uuid)?.mappings[0]?.name
    ?? mappings.data?.find((mapping) => mapping.entity.uuid === location?.uuid)?.mappings[0]?.display;
  const defaultTypeName = mappedTypeName ?? config?.defaultVisitType;
  const defaultVisitType = visitTypes.data?.find((type) => (type.name ?? type.display) === defaultTypeName) ?? visitTypes.data?.[0];

  const selectedVisitType = visitTypes.data?.find((type) => type.uuid === selectedVisitTypeUuid) ?? defaultVisitType;
  const nextExtension = extensions.data?.find((extension) => extension.extensionPointId === "org.bahmni.registration.patient.next" && extension.type === "config" && extensionAllowed(extension, user));
  const canStartVisit = Boolean(visitLocation.data?.uuid) && (hasPrivilege(user, "Add Visits") || hasPrivilege(user, "Edit Visits") || hasPrivilege(user, "app:registration"));
  const action = useMemo(() => config ? resolveRegistrationWorkflow({ activeVisit, config, nextExtension, selectedVisitType, canStartVisit }) : null, [activeVisit, canStartVisit, config, nextExtension, selectedVisitType]);

  return {
    action,
    activeVisit,
    visitLocationUuid: visitLocation.data?.uuid,
    visitTypes: visitTypes.data ?? [],
    selectedVisitTypeUuid: selectedVisitType?.uuid ?? "",
    setSelectedVisitTypeUuid,
    loading: visits.isLoading || visitLocation.isLoading || visitTypes.isLoading || mappings.isLoading || extensions.isLoading,
    error: visits.error ?? visitLocation.error ?? visitTypes.error ?? mappings.error ?? extensions.error,
  };
}
