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
import { MpiFlowLink } from "@/features/registration/MpiFlowLink";
import { MissingPatientUuidError, saveNewPatientWithMpi } from "@/features/registration/saveNewPatientWithMpi";
import { executeRegistrationWorkflow } from "@/features/registration/executeWorkflow";
import { useRequiredPatientAttributeCatalogs } from "@/features/registration/useRequiredPatientAttributeCatalogs";
import { useRegistrationWorkflow } from "@/features/registration/useRegistrationWorkflow";
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
    ? "OpenMRS pudo haber creado una ficha sin devolver una respuesta completa. Busque el paciente antes de intentar otra alta."
    : mpiAdmissionMode === "preview" ? "Prueba MPI sintética: puede recorrer el formulario, pero el guardado clínico está deshabilitado."
      : mpiAdmissionMode === "integrated" && !eisConfigReady ? "La configuración EIS de registro está incompleta. Restáurela antes de guardar pacientes con MPI."
        : mpiAdmissionMode === "integrated" && confirmedIdentity?.run && !runTypeAvailable ? "OpenMRS no publica el tipo de identificador RUN; no es seguro guardar esta identidad."
          : undefined;

  return <AuthGuard><AppShell title="Nuevo paciente">
    {mpiAdmissionMode === "integrated" && <div className="mpi-flow-shortcut"><MpiFlowLink /></div>}
    {loading && <p role="status">Cargando configuración de Registro…</p>}
    {failed && <p role="alert" className="error-banner">No fue posible cargar toda la configuración necesaria para registrar pacientes.</p>}
    {optionalFailure && <p role="status" className="warning-banner">Algunos datos auxiliares no están disponibles. Puede registrar al paciente; relaciones o dirección jerárquica se habilitarán al reintentar.</p>}
    {!loading && !failed && config && mpiAdmissionMode !== "off" && !confirmedIdentity && <MpiAdmissionGate onContinue={setConfirmedIdentity} onOpenExisting={(patientUuid) => void router.push(`/registration/patient/${encodeURIComponent(patientUuid)}`)} />}
    {!loading && !failed && config && (mpiAdmissionMode === "off" || confirmedIdentity) && <>
      {confirmedIdentity && <div className="panel mpi-admission-confirmed"><div><strong>{confirmedIdentity.run ? `RUN ${confirmedIdentity.run} verificado para admisión` : "Sin RUN: vínculo MPI pendiente"}</strong><span>{confirmedIdentity.patient ? "Complete y verifique los campos EIS antes de guardar." : "Complete la ficha con el documento presentado."}</span></div><Button type="button" outlined label="Cambiar identidad" onClick={() => setConfirmedIdentity(null)} /></div>}
      <PatientForm key={confirmedIdentity?.run ?? (confirmedIdentity ? "sin-run" : "legacy")}
      initial={formInitial} activeLocationUuid={location?.uuid} config={config} workflow={workflow} identifierTypes={identifiers.data ?? []} attributeTypes={attributes.data ?? []} relationshipTypes={relationships.data ?? []} addressLevels={addressLevels.data ?? []} saveDisabledReason={saveDisabledReason} allowDuplicateOverride={mpiAdmissionMode === "off"}
      onGenerateId={(identifierSourceName) => mpiAdmissionMode === "preview"
        ? Promise.reject(new Error("La vista previa no genera identificadores en OpenMRS."))
        : generateIdentifier(identifierSourceName ?? config.defaultIdentifierPrefix)}
      onSave={async (values: PatientFormValues, jumpAccepted: boolean, intent) => {
        if (saveDisabledReason) throw new Error(saveDisabledReason);
        let saved;
        try {
          saved = await saveNewPatientWithMpi(values, jumpAccepted, mpiAdmissionMode, confirmedIdentity?.run, identifiers.data ?? [], {
            saveProfile: async (patientValues, accepted) => {
              try { return await savePatient(patientValues, accepted); }
              catch (error) {
                if (!(error instanceof BahmniApiError) || error.status >= 500) setUncertainCreation(true);
                throw error;
              }
            },
            saveMetadata: savePatientIdentifierMetadata,
            syncMpi: syncPatientWithMpi,
            uploadImage: uploadPatientImage,
            enrollBiometric: enrollPatientBiometrics,
          });
        } catch (error) {
          if (error instanceof MissingPatientUuidError) setUncertainCreation(true);
          throw error;
        }
        if (saved.pending) {
          const pending = saved.pending === "biometric" ? "biometric=failed" : saved.pending === "photo" ? "photo=pending" : saved.pending === "eis" ? "eis=pending" : `mpi=${saved.pending === "no-run" ? "no-run" : "pending"}`;
          await router.replace(`/registration/patient/${encodeURIComponent(saved.uuid)}?saved=1&${pending}`);
          return;
        }
        await executeRegistrationWorkflow(intent, saved.uuid, workflow.visitLocationUuid, router);
      }}
    /></>}
  </AppShell></AuthGuard>;
}
