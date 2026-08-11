import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { AppShell } from "@/components/AppShell";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { PatientForm } from "@/features/registration/PatientForm";
import { executeRegistrationWorkflow } from "@/features/registration/executeWorkflow";
import { useRegistrationWorkflow } from "@/features/registration/useRegistrationWorkflow";
import { getAddressLevels } from "@/services/bahmni/address";
import { loadAppConfig } from "@/services/bahmni/config";
import { getIdentifierTypes, getPersonAttributeTypes, getRelationshipTypes, type PersonAttributeType } from "@/services/bahmni/metadata";
import { generateIdentifier, getPatientProfile, savePatient, uploadPatientImage } from "@/services/bahmni/patients";
import type { PatientFormValues } from "@/types/bahmni";

export function profileToForm(profile: Record<string, unknown>, uuid: string, attributeTypes: PersonAttributeType[]): Partial<PatientFormValues> {
  const person = (profile.person ?? (profile.patient as Record<string, unknown> | undefined)?.person ?? profile) as Record<string, unknown>;
  const patient = (profile.patient ?? profile) as Record<string, unknown>;
  const names = ((person.names as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {};
  const address = ((person.addresses as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {};
  const rawIdentifiers = (patient.identifiers as Array<Record<string, unknown>> | undefined) ?? [];
  const identifier = rawIdentifiers.find((item) => item.preferred === true) ?? rawIdentifiers[0] ?? {};
  const additionalIdentifiers = rawIdentifiers.filter((item) => item !== identifier).flatMap((item) => {
    const identifierType = item.identifierType as { uuid?: string } | string | undefined;
    const typeUuid = typeof identifierType === "string" ? identifierType : identifierType?.uuid;
    if (!typeUuid) return [];
    const source = item.identifierSource as { uuid?: string; prefix?: string } | undefined;
    return [{ uuid: typeof item.uuid === "string" ? item.uuid : undefined, identifier: String(item.identifier ?? ""), identifierTypeUuid: typeUuid, identifierSourceUuid: source?.uuid ?? (typeof item.identifierSourceUuid === "string" ? item.identifierSourceUuid : undefined), identifierPrefix: source?.prefix ?? (typeof item.identifierPrefix === "string" ? item.identifierPrefix : undefined) }];
  });
  const rawAttributes = (person.attributes as Array<{ attributeType?: { uuid?: string; name?: string; display?: string }; value?: unknown }> | undefined) ?? [];
  const rawRelationships = (profile.relationships as Array<Record<string, unknown>> | undefined) ?? [];
  const attributes = Object.fromEntries(rawAttributes.flatMap((item) => item.attributeType?.uuid ? [[item.attributeType.uuid, typeof item.value === "object" && item.value && "uuid" in item.value ? (item.value as { uuid: string }).uuid : item.value]] : []));
  const attributeUuids = Object.fromEntries(rawAttributes.flatMap((item) => item.attributeType?.uuid && "uuid" in item && typeof item.uuid === "string" ? [[item.attributeType.uuid, item.uuid]] : []));
  const phoneUuid = attributeTypes.find((type) => (type.name ?? type.display) === "phoneNumber")?.uuid;
  const relationships = rawRelationships.flatMap((item) => {
    const type = item.relationshipType as { uuid?: string } | undefined;
    const personA = item.personA as { uuid?: string; display?: string } | undefined;
    const personB = item.personB as { uuid?: string; display?: string } | undefined;
    const related = personA?.uuid === uuid ? personB : personA;
    return type?.uuid && related?.uuid ? [{ relationshipTypeUuid: type.uuid, personUuid: related.uuid, personDisplay: related.display, relationshipUuid: typeof item.uuid === "string" ? item.uuid : undefined }] : [];
  });
  const birthtime = typeof person.birthtime === "string" && person.birthtime.includes("T") ? person.birthtime.split("T")[1]?.slice(0, 5) : undefined;
  return {
    uuid, nameUuid: typeof names.uuid === "string" ? names.uuid : undefined, addressUuid: typeof address.uuid === "string" ? address.uuid : undefined, identifierUuid: typeof identifier.uuid === "string" ? identifier.uuid : undefined, givenName: String(names.givenName ?? ""), middleName: String(names.middleName ?? ""), familyName: String(names.familyName ?? ""), gender: String(person.gender ?? ""),
    birthDate: typeof person.birthdate === "string" ? person.birthdate.slice(0, 10) : "", birthDateEstimated: Boolean(person.birthdateEstimated), birthTime: birthtime,
    identifier: String(identifier.identifier ?? ""), identifierTypeUuid: String((identifier.identifierType as { uuid?: string } | undefined)?.uuid ?? identifier.identifierType ?? ""), identifierSourceUuid: String((identifier.identifierSource as { uuid?: string } | undefined)?.uuid ?? identifier.identifierSourceUuid ?? "") || undefined, identifierPrefix: String((identifier.identifierSource as { prefix?: string } | undefined)?.prefix ?? identifier.identifierPrefix ?? "") || undefined, additionalIdentifiers,
    address1: String(address.address1 ?? ""), address2: String(address.address2 ?? ""), address3: String(address.address3 ?? ""), address4: String(address.address4 ?? ""), address5: String(address.address5 ?? ""), address6: String(address.address6 ?? ""), cityVillage: String(address.cityVillage ?? ""), countyDistrict: String(address.countyDistrict ?? ""), stateProvince: String(address.stateProvince ?? ""), country: String(address.country ?? ""), postalCode: String(address.postalCode ?? ""),
    phoneNumber: phoneUuid ? String(attributes[phoneUuid] ?? "") : "", attributes, attributeUuids, relationships, dead: Boolean(person.dead), deathDate: typeof person.deathDate === "string" ? person.deathDate.slice(0, 10) : undefined,
  };
}

export default function EditPatient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const uuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const profile = useQuery({ queryKey: ["patient", uuid], queryFn: () => getPatientProfile(uuid), enabled: Boolean(uuid) });
  const identifiers = useQuery({ queryKey: ["identifier-types"], queryFn: getIdentifierTypes });
  const attributes = useQuery({ queryKey: ["person-attribute-types"], queryFn: getPersonAttributeTypes });
  const relationships = useQuery({ queryKey: ["relationship-types"], queryFn: getRelationshipTypes });
  const addressLevels = useQuery({ queryKey: ["address-levels"], queryFn: getAddressLevels });
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const workflow = useRegistrationWorkflow(uuid, config);
  const queries = [profile, identifiers, attributes, descriptor];
  const loading = queries.some((query) => query.isLoading);
  const failed = queries.some((query) => query.isError);
  const optionalFailure = relationships.isError || addressLevels.isError;

  return <AuthGuard><AppShell title="Editar paciente">
    {router.query.saved === "1" && <p role="status" className="success-banner">Paciente guardado correctamente.</p>}
    {loading && <p role="status">Cargando paciente y configuración…</p>}
    {failed && <p role="alert" className="error-banner">No fue posible cargar el perfil completo del paciente.</p>}
    {optionalFailure && <p role="status" className="warning-banner">Relaciones o dirección jerárquica no están disponibles temporalmente; el resto del perfil puede editarse.</p>}
    {!loading && !failed && profile.data && config && <PatientForm initial={profileToForm(profile.data, uuid, attributes.data ?? [])} config={config} workflow={workflow} identifierTypes={identifiers.data ?? []} attributeTypes={attributes.data ?? []} relationshipTypes={relationships.data ?? []} addressLevels={addressLevels.data ?? []} onGenerateId={(identifierSourceName) => generateIdentifier(identifierSourceName ?? config.defaultIdentifierPrefix)} onSave={async (values, jumpAccepted, intent) => { await savePatient(values, jumpAccepted); if (values.image) await uploadPatientImage(uuid, values.image); await queryClient.invalidateQueries({ queryKey: ["patient", uuid] }); await executeRegistrationWorkflow(intent, uuid, workflow.visitLocationUuid, router); }} />}
  </AppShell></AuthGuard>;
}
