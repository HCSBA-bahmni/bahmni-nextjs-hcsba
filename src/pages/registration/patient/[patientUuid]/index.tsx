import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { LegacyPatientMigrationDialog, type LegacyPatientMigrationRequest } from "@/features/registration/LegacyPatientMigrationDialog";
import { PatientForm } from "@/features/registration/PatientForm";
import { MpiFlowLink } from "@/features/registration/MpiFlowLink";
import { executeRegistrationWorkflow } from "@/features/registration/executeWorkflow";
import { existingInstitutionalIdentifier, generateInstitutionalIdentifier, migrateLegacyPrimaryIdentifier, preMpiRunAddition } from "@/features/registration/legacyPatientMigration";
import { useRequiredPatientAttributeCatalogs } from "@/features/registration/useRequiredPatientAttributeCatalogs";
import { useRegistrationWorkflow } from "@/features/registration/useRegistrationWorkflow";
import { getAddressLevels } from "@/services/bahmni/address";
import { loadAppConfig } from "@/services/bahmni/config";
import { getIdentifierTypes, getPersonAttributeTypes, getRelationshipTypes, type PersonAttributeType } from "@/services/bahmni/metadata";
import { getPatientIdentifierMetadata, metadataValues, savePatientIdentifierMetadata, type IdentifierMetadataRecord } from "@/services/bahmni/identifierMetadata";
import { generateIdentifier, getPatientProfile, isPatientImageDataUrl, patientImageUrl, savePatient, uploadPatientImage } from "@/services/bahmni/patients";
import { enrollPatientBiometrics } from "@/services/biometrics";
import { hasRunChanged, mpiAdmissionMode, runFromForm, syncPatientWithMpi } from "@/services/mpi/admission";
import type { PatientFormValues } from "@/types/bahmni";

interface PendingLegacyMigration extends LegacyPatientMigrationRequest {
  resolve(confirmed: boolean): void;
}

export function profileToForm(profile: Record<string, unknown>, uuid: string, attributeTypes: PersonAttributeType[], identifierMetadata: IdentifierMetadataRecord[] = []): Partial<PatientFormValues> {
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
    const identifierLocation = item.location as { uuid?: string } | string | undefined;
    const identifierUuid = typeof item.uuid === "string" ? item.uuid : undefined;
    const metadata = identifierMetadata.find((entry) => entry.identifierUuid === identifierUuid);
    return [{ uuid: identifierUuid, identifier: String(item.identifier ?? ""), identifierTypeUuid: typeUuid, identifierSourceUuid: source?.uuid ?? (typeof item.identifierSourceUuid === "string" ? item.identifierSourceUuid : undefined), identifierPrefix: source?.prefix ?? (typeof item.identifierPrefix === "string" ? item.identifierPrefix : undefined), locationUuid: typeof identifierLocation === "string" ? identifierLocation : identifierLocation?.uuid, metadata: metadataValues(metadata) }];
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
  const primaryIdentifierLocation = identifier.location as { uuid?: string } | string | undefined;
  return {
    uuid, nameUuid: typeof names.uuid === "string" ? names.uuid : undefined, addressUuid: typeof address.uuid === "string" ? address.uuid : undefined, identifierUuid: typeof identifier.uuid === "string" ? identifier.uuid : undefined, givenName: String(names.givenName ?? ""), middleName: String(names.middleName ?? ""), familyName: String(names.familyName ?? ""), familyName2: String(names.familyName2 ?? ""), gender: String(person.gender ?? ""),
    birthDate: typeof person.birthdate === "string" ? person.birthdate.slice(0, 10) : "", birthDateEstimated: Boolean(person.birthdateEstimated), birthTime: birthtime,
    identifier: String(identifier.identifier ?? ""), identifierTypeUuid: String((identifier.identifierType as { uuid?: string } | undefined)?.uuid ?? identifier.identifierType ?? ""), identifierSourceUuid: String((identifier.identifierSource as { uuid?: string } | undefined)?.uuid ?? identifier.identifierSourceUuid ?? "") || undefined, identifierPrefix: String((identifier.identifierSource as { prefix?: string } | undefined)?.prefix ?? identifier.identifierPrefix ?? "") || undefined, locationUuid: typeof primaryIdentifierLocation === "string" ? primaryIdentifierLocation : primaryIdentifierLocation?.uuid, additionalIdentifiers,
    address1: String(address.address1 ?? ""), address2: String(address.address2 ?? ""), address3: String(address.address3 ?? ""), address4: String(address.address4 ?? ""), address5: String(address.address5 ?? ""), address6: String(address.address6 ?? ""), cityVillage: String(address.cityVillage ?? ""), countyDistrict: String(address.countyDistrict ?? ""), stateProvince: String(address.stateProvince ?? ""), country: String(address.country ?? ""), postalCode: String(address.postalCode ?? ""),
    phoneNumber: phoneUuid ? String(attributes[phoneUuid] ?? "") : "", attributes, attributeUuids, relationships, dead: Boolean(person.dead), deathDate: typeof person.deathDate === "string" ? person.deathDate.slice(0, 10) : undefined,
    image: patientImageUrl(uuid, Date.now()),
  };
}

export default function EditPatient() {
  const router = useRouter();
  const { location } = useAuth();
  const [mpiRetrying, setMpiRetrying] = useState(false);
  const [mpiRetryError, setMpiRetryError] = useState("");
  const [mpiRecovered, setMpiRecovered] = useState(false);
  const [pendingMigration, setPendingMigration] = useState<PendingLegacyMigration>();
  const queryClient = useQueryClient();
  const uuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const profile = useQuery({ queryKey: ["patient", uuid], queryFn: () => getPatientProfile(uuid), enabled: Boolean(uuid) });
  const identifiers = useQuery({ queryKey: ["identifier-types"], queryFn: getIdentifierTypes });
  const attributes = useQuery({ queryKey: ["person-attribute-types"], queryFn: getPersonAttributeTypes });
  const relationships = useQuery({ queryKey: ["relationship-types"], queryFn: getRelationshipTypes });
  const addressLevels = useQuery({ queryKey: ["address-levels"], queryFn: getAddressLevels });
  const identifierMetadata = useQuery({ queryKey: ["identifier-metadata", uuid], queryFn: () => getPatientIdentifierMetadata(uuid), enabled: Boolean(uuid), retry: false });
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const requiredAttributeCatalogs = useRequiredPatientAttributeCatalogs(attributes.data ?? [], config?.mandatoryAttributeNames ?? []);
  const workflow = useRegistrationWorkflow(uuid, config);
  const queries = [profile, identifiers, attributes, descriptor];
  const loading = queries.some((query) => query.isLoading) || identifierMetadata.isLoading || requiredAttributeCatalogs.isLoading;
  const failed = queries.some((query) => query.isError) || requiredAttributeCatalogs.isError;
  const optionalFailure = relationships.isError || addressLevels.isError || identifierMetadata.isError;
  const initialValues = profile.data ? profileToForm(profile.data, uuid, attributes.data ?? [], identifierMetadata.data ?? []) : undefined;
  const resolveMigration = (confirmed: boolean) => {
    const pending = pendingMigration;
    setPendingMigration(undefined);
    pending?.resolve(confirmed);
  };
  const confirmLegacyMigration = (request: LegacyPatientMigrationRequest) => new Promise<boolean>((resolve) => {
    setPendingMigration({ ...request, resolve });
  });

  return <AuthGuard><AppShell title="Editar paciente">
    {mpiAdmissionMode === "integrated" && <div className="mpi-flow-shortcut"><MpiFlowLink /></div>}
    {router.query.saved === "1" && <p role="status" className="success-banner">Paciente guardado correctamente.</p>}
    {router.query.eis === "pending" && <p role="alert" className="warning-banner">La ficha se guardó en OpenMRS, pero faltan los metadatos EIS del documento. Revise el documento y guarde esta misma ficha para completar el registro; no cree otro paciente.</p>}
    {router.query.mpi === "no-run" && <p role="status" className="warning-banner">La ficha se creó sin RUN. El vínculo MPI queda pendiente hasta contar con un identificador admitido para el pareo.</p>}
    {router.query.mpi === "pending" && !mpiRecovered && <div role="alert" className="warning-banner mpi-retry-banner"><span>La ficha se creó en OpenMRS, pero su vínculo MPI/CRID está pendiente. No cree otra ficha.</span>{mpiAdmissionMode === "integrated" && <Button type="button" label="Reintentar vínculo MPI" loading={mpiRetrying} onClick={async () => { setMpiRetrying(true); setMpiRetryError(""); try { await syncPatientWithMpi(uuid); setMpiRecovered(true); await queryClient.invalidateQueries({ queryKey: ["patient", uuid] }); } catch (error) { setMpiRetryError(error instanceof Error ? error.message : "No fue posible vincular la ficha."); } finally { setMpiRetrying(false); } }} />}</div>}
    {mpiRetryError && <p role="alert" className="error-banner">{mpiRetryError}</p>}
    {mpiRecovered && <p role="status" className="success-banner">La ficha quedó vinculada al MPI.</p>}
    {router.query.photo === "pending" && <p role="alert" className="warning-banner">La ficha se creó, pero la fotografía quedó pendiente. Puede volver a adjuntarla en esta ficha.</p>}
    {router.query.biometric === "failed" && <p role="alert" className="warning-banner">El paciente y su fotografía se guardaron, pero no fue posible registrar la plantilla biométrica. Puede volver a tomar la foto e intentarlo nuevamente.</p>}
    {loading && <p role="status">Cargando paciente y configuración…</p>}
    {failed && <p role="alert" className="error-banner">No fue posible cargar el perfil completo del paciente.</p>}
    {optionalFailure && <p role="status" className="warning-banner">Relaciones o dirección jerárquica no están disponibles temporalmente; el resto del perfil puede editarse.</p>}
    {pendingMigration && <LegacyPatientMigrationDialog request={pendingMigration} onCancel={() => resolveMigration(false)} onConfirm={() => resolveMigration(true)} />}
    {!loading && !failed && profile.data && config && <PatientForm initial={{ ...initialValues, locationUuid: initialValues?.locationUuid ?? location?.uuid }} activeLocationUuid={location?.uuid} config={config} workflow={workflow} identifierTypes={identifiers.data ?? []} attributeTypes={attributes.data ?? []} relationshipTypes={relationships.data ?? []} addressLevels={addressLevels.data ?? []} onGenerateId={(identifierSourceName) => generateIdentifier(identifierSourceName ?? config.defaultIdentifierPrefix)} onSave={async (values, jumpAccepted, intent) => {
      const identifierTypes = identifiers.data ?? [];
      const original = profileToForm(profile.data, uuid, attributes.data ?? [], identifierMetadata.data ?? []);
      let valuesToSave = values;
      if (mpiAdmissionMode === "integrated") {
        if (hasRunChanged(original, values, identifiers.data ?? [])) {
          const addition = preMpiRunAddition(original, values, identifierTypes);
          if (!addition) {
            throw new Error(runFromForm(original, identifierTypes)
              ? "El RUN cambió. Verifique la identidad en admisión antes de guardar la corrección."
              : "El RUN ingresado no coincide con el identificador histórico de esta ficha. Se requiere adjudicar la identidad antes de guardar.");
          }
          const defaultPrefix = config.defaultIdentifierPrefix;
          if (!defaultPrefix) throw new Error("La configuración no define la fuente IDGen para regularizar la ficha clínica.");
          const existingHcsba = existingInstitutionalIdentifier(values, identifierTypes, defaultPrefix);
          const confirmed = await confirmLegacyMigration({ patientUuid: uuid, run: addition.run, legacyIdentifier: addition.legacyIdentifier });
          if (!confirmed) return;
          const generated = existingHcsba ? undefined : await generateInstitutionalIdentifier(
            identifierTypes, original.identifierTypeUuid, defaultPrefix, generateIdentifier,
          );
          valuesToSave = migrateLegacyPrimaryIdentifier(original, values, identifierTypes, defaultPrefix, generated);
        }
      }
      const currentRun = runFromForm(valuesToSave, identifierTypes);
      await savePatient(valuesToSave, jumpAccepted);
      try { await savePatientIdentifierMetadata(uuid, valuesToSave); }
      catch {
        await queryClient.invalidateQueries({ queryKey: ["patient", uuid] });
        await queryClient.invalidateQueries({ queryKey: ["identifier-metadata", uuid] });
        await router.replace(`/registration/patient/${encodeURIComponent(uuid)}?saved=1&eis=pending`);
        return;
      }
      if (mpiAdmissionMode === "integrated" && currentRun) {
        try { await syncPatientWithMpi(uuid); }
        catch { await router.replace(`/registration/patient/${encodeURIComponent(uuid)}?saved=1&mpi=pending`); return; }
      }
      if (isPatientImageDataUrl(valuesToSave.image)) await uploadPatientImage(uuid, valuesToSave.image);
      if (valuesToSave.biometricEnrollmentRequested && isPatientImageDataUrl(valuesToSave.image)) {
        try { await enrollPatientBiometrics(uuid, valuesToSave.image); }
        catch { await router.replace(`/registration/patient/${encodeURIComponent(uuid)}?saved=1&biometric=failed`); return; }
      }
      await queryClient.invalidateQueries({ queryKey: ["patient", uuid] });
      await queryClient.invalidateQueries({ queryKey: ["identifier-metadata", uuid] });
      await executeRegistrationWorkflow(intent, uuid, workflow.visitLocationUuid, router);
    }} />}
  </AppShell></AuthGuard>;
}
