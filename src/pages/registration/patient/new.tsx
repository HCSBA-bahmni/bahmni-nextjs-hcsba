import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { AppShell } from "@/components/AppShell";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { PatientForm } from "@/features/registration/PatientForm";
import { executeRegistrationWorkflow } from "@/features/registration/executeWorkflow";
import { useRegistrationWorkflow } from "@/features/registration/useRegistrationWorkflow";
import { getAddressLevels } from "@/services/bahmni/address";
import { loadAppConfig } from "@/services/bahmni/config";
import { getIdentifierTypes, getPersonAttributeTypes, getRelationshipTypes } from "@/services/bahmni/metadata";
import { generateIdentifier, savePatient, uploadPatientImage } from "@/services/bahmni/patients";
import type { PatientFormValues } from "@/types/bahmni";

export default function NewPatient() {
  const router = useRouter();
  const { location } = useAuth();
  const identifiers = useQuery({ queryKey: ["identifier-types"], queryFn: getIdentifierTypes });
  const attributes = useQuery({ queryKey: ["person-attribute-types"], queryFn: getPersonAttributeTypes });
  const relationships = useQuery({ queryKey: ["relationship-types"], queryFn: getRelationshipTypes });
  const addressLevels = useQuery({ queryKey: ["address-levels"], queryFn: getAddressLevels });
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const workflow = useRegistrationWorkflow(undefined, config);
  const loading = [identifiers, attributes, descriptor].some((query) => query.isLoading);
  const failed = [identifiers, attributes, descriptor].some((query) => query.isError);
  const optionalFailure = relationships.isError || addressLevels.isError;

  return <AuthGuard><AppShell title="Nuevo paciente">
    {loading && <p role="status">Cargando configuración de Registro…</p>}
    {failed && <p role="alert" className="error-banner">No fue posible cargar toda la configuración necesaria para registrar pacientes.</p>}
    {optionalFailure && <p role="status" className="warning-banner">Algunos datos auxiliares no están disponibles. Puede registrar al paciente; relaciones o dirección jerárquica se habilitarán al reintentar.</p>}
    {!loading && !failed && config && <PatientForm
      initial={{ locationUuid: location?.uuid }} config={config} workflow={workflow} identifierTypes={identifiers.data ?? []} attributeTypes={attributes.data ?? []} relationshipTypes={relationships.data ?? []} addressLevels={addressLevels.data ?? []}
      onGenerateId={(identifierSourceName) => generateIdentifier(identifierSourceName ?? config.defaultIdentifierPrefix)}
      onSave={async (values: PatientFormValues, jumpAccepted: boolean, intent) => {
        const saved = await savePatient(values, jumpAccepted);
        const uuid = String(saved.uuid ?? (saved.patient as { uuid?: string } | undefined)?.uuid ?? "");
        if (!uuid) throw new Error("El servidor no devolvió el UUID del paciente creado.");
        if (values.image) await uploadPatientImage(uuid, values.image);
        await executeRegistrationWorkflow(intent, uuid, workflow.visitLocationUuid, router);
      }}
    />}
  </AppShell></AuthGuard>;
}
