import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { PatientForm } from "@/features/registration/PatientForm";
import { MpiAdmissionGate, type ConfirmedMpiIdentity } from "@/features/registration/MpiAdmissionGate";
import { MissingPatientUuidError, saveNewPatientWithMpi } from "@/features/registration/saveNewPatientWithMpi";
import { executeRegistrationWorkflow } from "@/features/registration/executeWorkflow";
import { useRequiredPatientAttributeCatalogs } from "@/features/registration/useRequiredPatientAttributeCatalogs";
import { useRegistrationWorkflow } from "@/features/registration/useRegistrationWorkflow";
import { useMpiIdentityReview } from "@/features/registration/useMpiIdentityReview";
import { valuesForPendingReview } from "@/services/mpi/localIdentity";
import { getAddressLevels } from "@/services/bahmni/address";
import { loadAppConfig } from "@/services/bahmni/config";
import { getIdentifierTypes, getPersonAttributeTypes, getRelationshipTypes } from "@/services/bahmni/metadata";
import { savePatientIdentifierMetadata } from "@/services/bahmni/identifierMetadata";
import { generateIdentifier, savePatient, uploadPatientImage } from "@/services/bahmni/patients";
import { enrollPatientBiometrics } from "@/services/biometrics";
import { mpiAdmissionMode, mpiPatientFormSeed, syncPatientWithMpi } from "@/services/mpi/admission";
import { BahmniApiError } from "@/services/bahmni/http";
import type { PatientFormValues } from "@/types/bahmni";

export default function NewPatient() {
  const router = useRouter();
  const identityReview = useMpiIdentityReview(uuid => void router.push(`/registration/patient/${encodeURIComponent(uuid)}`));
  const { location } = useAuth();
  const [confirmedIdentity, setConfirmedIdentity] = useState<ConfirmedMpiIdentity | null>(null);
  const [uncertainCreation, setUncertainCreation] = useState(false);
  const identifiers = useQuery({ queryKey: ["identifier-types"], queryFn: getIdentifierTypes });
  const attributes = useQuery({ queryKey: ["person-attribute-types"], queryFn: getPersonAttributeTypes });
  const relationships = useQuery({ queryKey: ["relationship-types"], queryFn: getRelationshipTypes });
  const addressLevels = useQuery({ queryKey: ["address-levels"], queryFn: getAddressLevels });
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const requiredAttributeCatalogs = useRequiredPatientAttributeCatalogs(attributes.data ?? [], config?.mandatoryAttributeNames ?? []);
  const workflow = useRegistrationWorkflow(undefined, config);
  const loading = [identifiers, attributes, descriptor].some((query) => query.isLoading) || requiredAttributeCatalogs.isLoading;
  const failed = [identifiers, attributes, descriptor].some((query) => query.isError) || requiredAttributeCatalogs.isError;
  const optionalFailure = relationships.isError || addressLevels.isError;
  const eisConfigReady = Boolean(config && Object.keys(config.identifierMetadata).length > 0 && config.mandatoryAttributeNames.length > 0);
  const runTypeAvailable = (identifiers.data ?? []).some((type) => (type.name ?? type.display) === "RUN");
  const formInitial = confirmedIdentity
    ? { locationUuid: location?.uuid, ...mpiPatientFormSeed(confirmedIdentity.patient, confirmedIdentity.run, identifiers.data ?? []) }
    : { locationUuid: location?.uuid };
  const saveDisabledReason = uncertainCreation
    ? "La ficha pudo haberse creado aunque no se recibió la confirmación. Busque el paciente antes de intentar otra alta."
    : mpiAdmissionMode === "preview" ? "Prueba MPI sintética: puede recorrer el formulario, pero el guardado clínico está deshabilitado."
      : mpiAdmissionMode === "integrated" && !eisConfigReady ? "Falta parte de la configuración de Registro. Solicite ayuda a soporte antes de guardar."
        : mpiAdmissionMode === "integrated" && confirmedIdentity?.run && !runTypeAvailable ? "El tipo de documento RUN no está disponible. Solicite ayuda a soporte antes de guardar."
          : undefined;

  return <AuthGuard><AppShell title="Nuevo paciente">
    {identityReview.dialog}
    {loading && <p role="status">Cargando configuración de Registro…</p>}
    {failed && <p role="alert" className="error-banner">No fue posible cargar toda la configuración necesaria para registrar pacientes.</p>}
    {optionalFailure && <p role="status" className="warning-banner">Algunos datos auxiliares no están disponibles. Puede registrar al paciente; relaciones o dirección jerárquica se habilitarán al reintentar.</p>}
    {!loading && !failed && config && mpiAdmissionMode !== "off" && !confirmedIdentity && <MpiAdmissionGate localIdentityEnabled={identityReview.enabled} onContinue={setConfirmedIdentity} onOpenExisting={(patientUuid) => void router.push(`/registration/patient/${encodeURIComponent(patientUuid)}`)} />}
    {!loading && !failed && config && (mpiAdmissionMode === "off" || confirmedIdentity) && <>
      {confirmedIdentity && <div className="panel mpi-admission-confirmed"><div><strong>{confirmedIdentity.run ? `RUN ${confirmedIdentity.run} verificado para admisión` : identityReview.enabled ? "Sin RUN: se buscarán posibles coincidencias" : "Sin RUN: verificación de identidad pendiente"}</strong><span>{confirmedIdentity.patient ? "Compare los datos con el documento presentado antes de guardar." : "Complete la ficha con el documento presentado."}</span></div><Button type="button" outlined label="Cambiar identidad" onClick={() => setConfirmedIdentity(null)} /></div>}
      <PatientForm key={confirmedIdentity?.run ?? (confirmedIdentity ? "sin-run" : "legacy")}
      initial={formInitial} activeLocationUuid={location?.uuid} config={config} workflow={workflow} identifierTypes={identifiers.data ?? []} attributeTypes={attributes.data ?? []} relationshipTypes={relationships.data ?? []} addressLevels={addressLevels.data ?? []} saveDisabledReason={saveDisabledReason} allowDuplicateOverride={mpiAdmissionMode === "off"}
      onGenerateId={(identifierSourceName) => mpiAdmissionMode === "preview"
        ? Promise.reject(new Error("La vista previa no genera identificadores en OpenMRS."))
        : generateIdentifier(identifierSourceName ?? config.defaultIdentifierPrefix)}
      onSave={async (values: PatientFormValues, jumpAccepted: boolean, intent) => {
        if (saveDisabledReason) throw new Error(saveDisabledReason);
        const review = await identityReview.prepare(values, identifiers.data ?? []);
        if (review === null) return;
        let saved;
        try {
          saved = await saveNewPatientWithMpi(valuesForPendingReview(values, identifiers.data ?? [], review), jumpAccepted, mpiAdmissionMode, confirmedIdentity?.run, identifiers.data ?? [], {
            saveProfile: async (patientValues, accepted) => {
              try { return await savePatient(patientValues, accepted); }
              catch (error) {
                if (!(error instanceof BahmniApiError) || error.status >= 500) setUncertainCreation(true);
                throw error;
              }
            },
            saveMetadata: savePatientIdentifierMetadata,
            localIdentityEnabled: identityReview.enabled,
            pendingReview: Boolean(review?.caseId),
            syncMpi: uuid => syncPatientWithMpi(uuid, review),
            uploadImage: uploadPatientImage,
            enrollBiometric: enrollPatientBiometrics,
          });
        } catch (error) {
          if (error instanceof MissingPatientUuidError) setUncertainCreation(true);
          throw error;
        }
        if (saved.pending) {
          const pending = saved.pending === "biometric" ? "biometric=failed" : saved.pending === "photo" ? "photo=pending" : saved.pending === "eis" ? "eis=pending" : `mpi=${saved.pending === "no-run" ? "no-run" : "pending"}`;
          await router.replace(`/registration/patient/${encodeURIComponent(saved.uuid)}?saved=1&${pending}${review?.caseId ? `&reviewCase=${encodeURIComponent(review.caseId)}` : ""}`);
          return;
        }
        if (review?.caseId && intent.kind === "save") {
          await router.replace(`/registration/patient/${encodeURIComponent(saved.uuid)}?saved=1&identity=pending`);
          return;
        }
        try { await executeRegistrationWorkflow(intent, saved.uuid, workflow.visitLocationUuid, router); }
        catch { await router.replace(`/registration/patient/${encodeURIComponent(saved.uuid)}?saved=1&workflow=pending`); }
      }}
    /></>}
  </AppShell></AuthGuard>;
}
