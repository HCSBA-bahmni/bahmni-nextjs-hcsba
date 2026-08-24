import Cookies from "js-cookie";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { resolveExtensionUrl } from "@/config-compat/legacyRoutes";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import type { Form2Observation } from "@/features/forms/form2";
import { formatRegistrationDestination } from "@/features/registration/workflow";
import { publishedFormIdentity, RegistrationFormSection } from "@/features/registration/RegistrationFormSection";
import { useRegistrationTranslations } from "@/features/registration/useRegistrationTranslations";
import { visitsAtEffectiveLocation } from "@/features/registration/visitLocation";
import { audit } from "@/services/bahmni/audit";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppConfig, loadExtensions } from "@/services/bahmni/config";
import { findRegistrationEncounter, getLatestPublishedForms } from "@/services/bahmni/forms";
import { getEncounterConfiguration, getVisitLocation } from "@/services/bahmni/metadata";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getBahmniErrorTechnicalDetails, type BahmniErrorTechnicalDetails } from "@/services/bahmni/http";
import { createRegistrationEncounter, endVisit, getActiveVisits, getVisitSummary } from "@/services/bahmni/visits";

interface FormResult { observations: Form2Observation[]; valid: boolean }
interface SaveDiagnostic extends BahmniErrorTechnicalDetails {
  providerPresent: boolean;
  observationCount: number;
  observations: Array<{
    conceptUuid: string;
    dataType: string;
    formFieldPath: string;
    valueType: string;
    groupMemberCount: number;
    voided: boolean;
  }>;
}
const plainTranslation = (value: string) => value.replace(/<[^>]+>/g, "");

function valueType(value: unknown): string {
  if (value === undefined) return "absent";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && "uuid" in value) return "coded";
  return typeof value;
}

function observationDiagnostic(observations: Form2Observation[]): SaveDiagnostic["observations"] {
  return observations.flatMap((observation) => [{
    conceptUuid: observation.concept.uuid,
    dataType: observation.concept.dataType,
    formFieldPath: observation.formFieldPath,
    valueType: valueType(observation.value),
    groupMemberCount: observation.groupMembers.length,
    voided: Boolean(observation.voided),
  }, ...observationDiagnostic(observation.groupMembers)]);
}

function extensionFormName(extension: Record<string, unknown>): string | undefined {
  const params = extension.extensionParams;
  return params && typeof params === "object" && !Array.isArray(params) && typeof (params as Record<string, unknown>).formName === "string"
    ? String((params as Record<string, unknown>).formName)
    : undefined;
}

function extensionFormPresentation(extension: Record<string, unknown>) {
  const raw = extension.extensionParams;
  const params = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    show: params.showLatest === true || params.showLatest === "true",
    conceptNames: Array.isArray(params.conceptNames) ? params.conceptNames.filter((name): name is string => typeof name === "string") : [],
  };
}

function patientSummary(profile: Record<string, unknown>) {
  const patient = (profile.patient ?? profile) as Record<string, unknown>;
  const person = (patient.person ?? profile.person ?? patient) as Record<string, unknown>;
  const name = ((person.names as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {};
  const identifiers = (patient.identifiers as Array<Record<string, unknown>> | undefined) ?? [];
  const identifier = identifiers.find((item) => item.preferred === true) ?? identifiers[0] ?? {};
  return {
    name: String(name.display ?? [name.givenName, name.middleName, name.familyName, name.familyName2].filter(Boolean).join(" ")),
    identifier: String(identifier.identifier ?? ""),
    identifierType: String((identifier.identifierType as { display?: string; name?: string } | undefined)?.display ?? (identifier.identifierType as { name?: string } | undefined)?.name ?? "Identificador"),
  };
}

export default function VisitPage() {
  useRegistrationTranslations();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { location, provider, user } = useAuth();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const requestedVisitUuid = typeof router.query.visitUuid === "string" ? router.query.visitUuid : "";
  const [formResults, setFormResults] = useState<Record<string, FormResult>>({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveDiagnostic, setSaveDiagnostic] = useState<SaveDiagnostic | null>(null);

  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: Boolean(patientUuid) });
  const visits = useQuery({
    queryKey: ["active-visits", patientUuid],
    queryFn: () => getActiveVisits(patientUuid),
    enabled: Boolean(patientUuid),
    // Starting a visit happens on the previous page. Always refresh here so
    // the 30-second shared query cache cannot hide the newly-created visit.
    refetchOnMount: "always",
  });
  const visitLocation = useQuery({
    queryKey: ["visit-location", location?.uuid],
    queryFn: () => getVisitLocation(location!.uuid),
    enabled: Boolean(location?.uuid),
  });
  const activeVisitLocations = useQueries({
    queries: (visits.data ?? []).map((visit) => ({
      queryKey: ["visit-location", visit.location?.uuid],
      queryFn: () => getVisitLocation(visit.location!.uuid),
      enabled: Boolean(visit.location?.uuid),
    })),
  });
  const encounterConfig = useQuery({ queryKey: ["encounter-config"], queryFn: getEncounterConfiguration });
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const extensions = useQuery({ queryKey: ["extensions", "registration"], queryFn: () => loadExtensions("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const registrationEncounterType = encounterConfig.data?.encounterTypes.REG;
  const encounter = useQuery({
    queryKey: ["registration-encounter", patientUuid, location?.uuid, provider?.uuid, registrationEncounterType],
    queryFn: () => findRegistrationEncounter({ patientUuid, locationUuid: location!.uuid, providerUuid: provider?.uuid, encounterTypeUuid: registrationEncounterType! }),
    enabled: Boolean(patientUuid && location?.uuid && registrationEncounterType),
    // A new visit may be opened immediately after closing the previous one.
    // Ask OpenMRS again instead of reusing the prior REG encounter response
    // from the shared 30-second cache. OpenMRS can still intentionally return
    // the last values as the legacy carry-forward baseline.
    refetchOnMount: "always",
  });
  const publishedForms = useQuery({
    queryKey: ["published-forms", encounter.data?.encounterUuid ?? "new"],
    queryFn: () => getLatestPublishedForms(encounter.data?.encounterUuid ?? undefined),
    enabled: encounter.isSuccess,
  });

  const visitsAtCurrentLocation = visitsAtEffectiveLocation(visits.data ?? [], activeVisitLocations.map((query) => query.data), visitLocation.data?.uuid);
  const activeVisit = visitsAtCurrentLocation.find((visit) => visit.uuid === requestedVisitUuid) ?? visitsAtCurrentLocation[0];
  const formExtensions = (extensions.data ?? []).filter((extension) => extension.extensionPointId === "org.bahmni.registration.conceptSetGroup.observations" && extension.type === "forms" && hasPrivilege(user, extension.requiredPrivilege));
  const availableForms = formExtensions.flatMap((extension) => {
    const name = extensionFormName(extension);
    const form = (publishedForms.data ?? []).find((item) => (item.formName ?? item.name) === name);
    return form ? [{ form, latest: extensionFormPresentation(extension) }] : [];
  });
  const missingForms = formExtensions.map(extensionFormName).filter((name): name is string => Boolean(name) && !availableForms.some((item) => (item.form.formName ?? item.form.name) === name));
  const summary = profile.data ? patientSummary(profile.data) : undefined;
  const canClose = hasPrivilege(user, "app:common:closeVisit") || hasPrivilege(user, "Delete Visits");
  const canGoClinical = hasPrivilege(user, "app:clinical") && Boolean(config?.enableDashboardRedirect);
  const loading = [profile, visits, visitLocation, ...activeVisitLocations, encounterConfig, descriptor, extensions, encounter, publishedForms].some((query) => query.isLoading);

  const updateForm = useCallback((key: string, observations: Form2Observation[], valid: boolean) => {
    setFormResults((current) => ({ ...current, [key]: { observations, valid } }));
  }, []);
  const formKeys = availableForms.map((item) => publishedFormIdentity(item.form).uuid);

  const save = async (goToClinical = false) => {
    if (!location?.uuid || !registrationEncounterType || !activeVisit) return setError("No existe una visita activa o una ubicación válida para guardar Registro.");
    if (!activeVisit.visitType?.uuid) return setError("La visita activa no contiene un tipo de visita válido para guardar Registro.");
    if (formKeys.some((key) => !formResults[key]?.valid)) return setError("Complete los campos obligatorios antes de guardar.");
    setWorking(true); setError(""); setMessage(""); setSaveDiagnostic(null);
    const observations = formKeys.flatMap((key) => formResults[key]?.observations ?? []);
    try {
      if (provider) Cookies.set("app.clinical.grantProviderAccessData", JSON.stringify(provider), { path: "/", sameSite: "lax", expires: 1 });
      const saved = await createRegistrationEncounter({
        patientUuid,
        locationUuid: location.uuid,
        encounterTypeUuid: registrationEncounterType,
        visitTypeUuid: activeVisit.visitType.uuid,
        observations,
        providerUuid: provider?.uuid,
      });
      const encounterUuid = typeof saved.encounterUuid === "string" ? saved.encounterUuid : undefined;
      void audit("EDIT_ENCOUNTER", JSON.stringify({ encounterUuid, encounterType: "REG" }), patientUuid, "MODULE_LABEL_REGISTRATION_KEY");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["registration-encounter", patientUuid] }),
        queryClient.invalidateQueries({ queryKey: ["registration", "latest-observations", patientUuid] }),
      ]);
      setMessage(plainTranslation(t("REGISTRATION_LABEL_SAVED", { defaultValue: "Guardado" })));
      const forwardUrl = goToClinical
        ? config?.dashboardUrl ?? "/bahmni/clinical/index.html#/default/patient/{{patientUuid}}/dashboard"
        : config?.afterVisitSaveForwardUrl;
      if (forwardUrl) {
        const destination = formatRegistrationDestination(forwardUrl, patientUuid, activeVisit.uuid);
        const resolved = resolveExtensionUrl(destination);
        if (resolved.kind === "next") await router.push(resolved.href.startsWith("/bahmni/") ? resolved.href.slice("/bahmni".length) : resolved.href);
        else window.location.assign(destination);
      }
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "No fue posible guardar los detalles de Registro.");
      setSaveDiagnostic({
        ...getBahmniErrorTechnicalDetails(exception),
        providerPresent: Boolean(provider?.uuid),
        observationCount: observations.length,
        observations: observationDiagnostic(observations),
      });
    }
    finally { setWorking(false); }
  };

  const closeVisit = async () => {
    if (!activeVisit || !window.confirm(plainTranslation(t("REGISTRATION_CONFIRM_CLOSE_VISIT", { defaultValue: "¿Confirma el cierre de esta visita?" })))) return;
    setWorking(true); setError("");
    try {
      const visitSummary = await getVisitSummary(activeVisit.uuid);
      if (visitSummary.admissionDetails && !visitSummary.dischargeDetails) {
        void audit("CLOSE_VISIT_FAILED", JSON.stringify({ visitUuid: activeVisit.uuid, visitType: visitSummary.visitType }), patientUuid, "MODULE_LABEL_REGISTRATION_KEY");
        setError(plainTranslation(t("REGISTRATION_VISIT_CANNOT_BE_CLOSED", { defaultValue: "La visita hospitalaria no puede cerrarse antes del alta." })));
        return;
      }
      await endVisit(activeVisit.uuid);
      void audit("CLOSE_VISIT", JSON.stringify({ visitUuid: activeVisit.uuid, visitType: visitSummary.visitType }), patientUuid, "MODULE_LABEL_REGISTRATION_KEY");
      // Do not let the patient edit page reuse the now-closed visit from the
      // shared query cache when navigation completes immediately.
      queryClient.removeQueries({ queryKey: ["active-visits", patientUuid] });
      queryClient.removeQueries({ queryKey: ["registration-encounter", patientUuid] });
      await router.push("/registration");
    } catch (exception) { setError(exception instanceof Error ? exception.message : "No fue posible cerrar la visita."); }
    finally { setWorking(false); }
  };

  return <AuthGuard><AppShell title="Detalles de Registro">
    {error && <div role="alert" className="error-banner">
      <p>{error}</p>
      {saveDiagnostic && <details><summary>Detalles técnicos seguros</summary><pre>{JSON.stringify(saveDiagnostic, null, 2)}</pre></details>}
    </div>}
    {message && <p role="status" className="success-banner">{message}</p>}
    {loading && <p role="status">Cargando visita y formulario de Registro…</p>}
    {!loading && !visitLocation.data && <section className="panel"><p role="alert" className="error-banner">La ubicación de inicio de sesión no tiene una ubicación de visita asociada.</p><Button label="Volver al paciente" onClick={() => void router.push(`/registration/patient/${patientUuid}`)} /></section>}
    {!loading && visitLocation.data && !activeVisit && <section className="panel"><p role="alert" className="error-banner">No hay una visita activa para este paciente en la ubicación de visita actual.</p><Button label="Volver al paciente" onClick={() => void router.push(`/registration/patient/${patientUuid}`)} /></section>}
    {!loading && activeVisit && <>
      <section className="panel"><h2>{plainTranslation(t("REGISTRATION_LABEL_SUMMARY", { defaultValue: "Resumen" }))}</h2><dl className="patient-summary"><div><dt>{summary?.identifierType}</dt><dd>{summary?.identifier || "—"}</dd></div><div><dt>{plainTranslation(t("REGISTRATION_LABEL_PATIENT_NAME", { defaultValue: "Nombre del paciente" }))}</dt><dd>{summary?.name || "—"}</dd></div></dl></section>
      {missingForms.length > 0 && <p role="alert" className="error-banner">No se encontraron formularios publicados para: {missingForms.join(", ")}.</p>}
      {availableForms.map(({ form, latest }) => <RegistrationFormSection key={publishedFormIdentity(form).uuid} form={form} patientUuid={patientUuid} observations={encounter.data?.observations ?? []} latest={latest} onChange={updateForm} />)}
      {availableForms.length === 0 && missingForms.length === 0 && <section className="panel"><p>No hay formularios de segunda página habilitados para sus privilegios.</p></section>}
      <div className="actions">
        {canClose && <Button type="button" severity="danger" outlined label={plainTranslation(t("REGISTRATION_LABEL_CLOSE_VISIT", { defaultValue: "Cerrar visita" }))} disabled={working} onClick={() => void closeVisit()} />}
        <Button type="button" outlined label={plainTranslation(t("REGISTRATION_LABEL_BACK", { defaultValue: "Atrás" }))} onClick={() => void router.push(`/registration/patient/${patientUuid}`)} />
        <Button type="button" label={plainTranslation(t("REGISTRATION_LABEL_SAVE", { defaultValue: "Guardar" }))} icon="pi pi-save" loading={working} disabled={missingForms.length > 0} onClick={() => void save(false)} />
        {canGoClinical && <Button type="button" label={plainTranslation(t("REGISTRATION_TO_CLINICAL", { defaultValue: "Guardar e ir al panel del paciente" }))} icon="pi pi-arrow-right" loading={working} disabled={missingForms.length > 0} onClick={() => void save(true)} />}
      </div>
    </>}
  </AppShell></AuthGuard>;
}
