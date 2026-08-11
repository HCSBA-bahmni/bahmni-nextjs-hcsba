import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Menu } from "primereact/menu";
import { ProgressSpinner } from "primereact/progressspinner";
import { Sidebar } from "primereact/sidebar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { consultationBoardsForPrivileges, parseConsultationAppConfig, parseConsultationBoards, parseConsultationForms, parseMedicationConfig } from "@/features/clinical/consultation/config";
import { ConsultationProvider, useConsultation } from "@/features/clinical/consultation/ConsultationContext";
import { buildConsultationEncounterPayload, conditionHistoryContainsSavedConditions, conditionHistoryReflectsDraftChanges, createConsultationDraft, encounterReflectsDraftChanges, markConsultationSaved, normalizeConsultationConditions } from "@/features/clinical/consultation/draft";
import { validateConsultationDraft } from "@/features/clinical/consultation/registry";
import { baseConsultationVisit, consultationMode, encounterVisitUuid } from "@/features/clinical/consultation/mode";
import type { ConsultationBoardConfig, ConsultationBoardSlug, ConsultationContextValue, ConsultationSaveResult } from "@/features/clinical/consultation/types";
import { consultationBoardSlugs } from "@/features/clinical/consultation/types";
import { ConsultationBoard } from "@/features/clinical/consultation/boards";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { useClinicalTranslations } from "@/features/clinical/useClinicalTranslations";
import { audit } from "@/services/bahmni/audit";
import { getGrantedEncounterProvider, hasPrivilege } from "@/services/bahmni/auth";
import { getPatientConditionHistory, getPatientDiagnoses } from "@/services/bahmni/clinical";
import {
  findActiveConsultationEncounter,
  generateAdhocTeleconsultationLink,
  getConsultationPatientDocuments,
  getConsultationEncounter,
  getConsultationNoteConcepts,
  getCdssAlerts,
  getCdssEnabled,
  resolveConsultationEncounterType,
  saveConsultationConditions,
  saveConsultationEncounter,
} from "@/services/bahmni/consultation";
import { loadAppConfig, loadAppFile, loadExtensions } from "@/services/bahmni/config";
import { getVisitLocation } from "@/services/bahmni/metadata";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits } from "@/services/bahmni/visits";
import { BahmniApiError } from "@/services/bahmni/http";
import type { AppExtension } from "@/types/bahmni";

function queryValue(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function extensionsFromObject(source: Record<string, unknown>): AppExtension[] {
  return Object.entries(source).flatMap(([id, value], sourceIndex) => value && typeof value === "object" && !Array.isArray(value) ? [{ id, ...(value as Omit<AppExtension, "id">), __sourceIndex: sourceIndex }] : []);
}
function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
class AmbiguousConsultationSaveError extends Error {
  constructor() {
    super("El servidor no confirmó el guardado y la lectura posterior tampoco permitió descartarlo. No repita el envío: recargue la consulta para verificar el encuentro.");
    this.name = "AmbiguousConsultationSaveError";
  }
}

function ConsultationWorkspace({ initialBoard }: { initialBoard: ConsultationBoardSlug }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { context, draft, setDraft, isDirty } = useConsultation();
  const visibleBoards = consultationBoardsForPrivileges(context.boards, context.user.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)));
  const current = visibleBoards.find((board) => board.slug === initialBoard) ?? visibleBoards[0];
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [conditionsPendingRetry, setConditionsPendingRetry] = useState(false);
  const [ambiguousSave, setAmbiguousSave] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const printMenu = useRef<Menu>(null);
  const documents = useQuery({ queryKey: ["consultation-patient-documents", context.patientUuid], queryFn: () => getConsultationPatientDocuments(context.patientUuid), enabled: documentsOpen });

  const readBackConditions = async (savedConditions: Record<string, unknown>[]) => {
    const conditionHistory = await getPatientConditionHistory(context.patientUuid);
    if (!conditionHistoryContainsSavedConditions(conditionHistory, savedConditions)) {
      throw new Error("OpenMRS no devolvió las condiciones modificadas en la lectura posterior al guardado.");
    }
    return normalizeConsultationConditions(conditionHistory);
  };

  const save = useMutation<ConsultationSaveResult, unknown>({ mutationFn: async () => {
    if (conditionsPendingRetry && !isDirty) {
      const currentConditions = normalizeConsultationConditions(await getPatientConditionHistory(context.patientUuid));
      if (conditionHistoryReflectsDraftChanges(currentConditions, draft.conditions)) {
        return { encounter: draft.rawEncounter ?? {}, conditionsSaved: true, persistedConditions: currentConditions, reconciledAfterAmbiguousSave: true };
      }
      const savedConditions = await saveConsultationConditions(context.patientUuid, draft.conditions);
      return { encounter: draft.rawEncounter ?? {}, conditionsSaved: true, persistedConditions: await readBackConditions(savedConditions) };
    }
    const validation = validateConsultationDraft(draft, visibleBoards.map((board) => board.slug), context);
    if (!validation.valid) {
      if (validation.board !== current?.slug) await router.push({ pathname: `/clinical/patient/${context.patientUuid}/consultation/${validation.board}`, query: consultationQuery(context) });
      window.setTimeout(() => validation.focusId && document.getElementById(validation.focusId)?.focus(), 80);
      throw new Error(validation.message ?? "La consulta contiene datos inválidos.");
    }
    const encounterType = await resolveConsultationEncounterType({ programUuid: context.programUuid, locationUuid: context.location.uuid });
    if (await getCdssEnabled().catch(() => false)) {
      const alerts = await getCdssAlerts({ patientUuid: context.patientUuid, diagnoses: draft.diagnoses.filter((item) => !item.voided && (item.codedAnswer?.uuid || item.freeTextAnswer?.trim())), drugOrders: draft.drugOrders.filter((item) => item.action !== "DISCONTINUE") });
      const critical = alerts.find((alert) => String(alert.severity ?? alert.indicator ?? "").toLowerCase() === "critical" && alert.active !== false);
      if (critical) throw new Error(String(critical.summary ?? critical.message ?? "Una alerta clínica crítica impide guardar esta consulta."));
    }
    const payload = buildConsultationEncounterPayload(draft, context, encounterType.uuid);
    let encounter: Record<string, unknown>;
    let reconciledAfterAmbiguousSave = false;
    try {
      const saveResponse = await saveConsultationEncounter(payload);
      const savedEncounterUuid = String(saveResponse.encounterUuid ?? saveResponse.uuid ?? draft.encounterUuid ?? "");
      encounter = savedEncounterUuid
        ? await getConsultationEncounter(savedEncounterUuid).catch(() => saveResponse)
        : saveResponse;
    } catch (error) {
      if (error instanceof BahmniApiError && error.status < 500) throw error;
      const readBack = draft.encounterUuid
        ? await getConsultationEncounter(draft.encounterUuid).catch(() => undefined)
        : await findActiveConsultationEncounter({ patientUuid: context.patientUuid, providerUuid: context.provider?.uuid, encounterTypeUuid: encounterType.uuid, locationUuid: context.location.uuid, enrollmentUuid: context.enrollmentUuid, visitUuid: context.visit?.uuid, encounterDate: context.retrospectiveDate }).catch(() => undefined);
      if (!readBack || !encounterReflectsDraftChanges(readBack, draft)) throw new AmbiguousConsultationSaveError();
      encounter = readBack;
      reconciledAfterAmbiguousSave = true;
    }
    try {
      const savedConditions = await saveConsultationConditions(context.patientUuid, draft.conditions);
      return { encounter, conditionsSaved: true, persistedConditions: await readBackConditions(savedConditions), reconciledAfterAmbiguousSave };
    } catch (conditionsError) {
      return { encounter, conditionsSaved: false, conditionsError, reconciledAfterAmbiguousSave };
    }
  }, onSuccess: async (result) => {
    setDraft(markConsultationSaved(draft, result.encounter, result.persistedConditions, !result.conditionsSaved));
    setAmbiguousSave(false);
    setConditionsPendingRetry(!result.conditionsSaved);
    await audit("EDIT_ENCOUNTER", JSON.stringify({ encounterUuid: result.encounter.encounterUuid ?? result.encounter.uuid }), context.patientUuid, "MODULE_LABEL_CLINICAL_KEY");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["consultation-encounter", context.patientUuid] }),
      queryClient.invalidateQueries({ queryKey: ["clinical-diagnoses", context.patientUuid] }),
      queryClient.invalidateQueries({ queryKey: ["clinical-condition-history", context.patientUuid] }),
      queryClient.invalidateQueries({ queryKey: ["consultation-active-medications", context.patientUuid] }),
      queryClient.invalidateQueries({ queryKey: ["consultation-prescribed-medications", context.patientUuid] }),
      queryClient.invalidateQueries({ queryKey: ["clinical-dashboard"] }),
    ]);
    setMessage(result.conditionsSaved
      ? { kind: result.reconciledAfterAmbiguousSave ? "warning" : "success", text: result.reconciledAfterAmbiguousSave ? "El encuentro fue confirmado mediante lectura posterior y no se volvió a enviar." : conditionsPendingRetry ? "Condiciones guardadas." : "Consulta guardada." }
      : { kind: "warning", text: "El encuentro fue guardado, pero las condiciones no. El siguiente intento reintentará únicamente las condiciones si no modifica otros datos." });
  }, onError: (error) => {
    setAmbiguousSave(error instanceof AmbiguousConsultationSaveError);
    setMessage({ kind: "error", text: error instanceof Error ? error.message : "No fue posible guardar la consulta." });
  } });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!isDirty) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  const navigate = (path: string) => {
    if (!isDirty) { void router.push(path); return; }
    setPendingPath(path); setNavigationOpen(true);
  };
  const navigateBoard = (board: ConsultationBoardConfig) => navigate(`/clinical/patient/${context.patientUuid}/consultation/${board.slug}?${new URLSearchParams(consultationQuery(context) as Record<string, string>).toString()}`);
  const saveAndContinue = async () => { const target = pendingPath; try { await save.mutateAsync(); if (target) await router.push(target); setNavigationOpen(false); } catch { /* message is rendered */ } };
  const continueWithoutSaving = async () => { const target = pendingPath; setNavigationOpen(false); if (target) await router.push(target); };
  const teleconsult = async () => {
    try {
      const response = await generateAdhocTeleconsultationLink(context.patientUuid, context.user.username ?? context.user.display ?? "");
      const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : response;
      if (typeof data.link !== "string") throw new Error("El backend no devolvió un enlace de teleconsulta.");
      window.open(data.link, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "No fue posible iniciar la teleconsulta." }); }
  };
  const printItems = [{ label: "Imprimir consulta", icon: "pi pi-print", command: () => window.print() }];
  const documentUploadUrl = `/bahmni/document-upload/?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file#/patient/${encodeURIComponent(context.patientUuid)}/document`;
  if (!current) return <p role="alert" className="error-banner">No hay tableros de consulta visibles para sus privilegios.</p>;

  return <div className="consultation-workspace">
    <div className="consultation-fixed">
      <section className="consultation-patient-header panel"><div><span className="clinical-eyebrow">{context.patient.identifier}</span><h1>{context.patient.name}</h1><p>{context.patient.gender || "Sexo no registrado"}{context.patient.age !== undefined ? ` · ${context.patient.age} años` : ""}</p></div><div className="consultation-context-summary"><strong>{context.visit?.visitType?.display ?? context.visit?.visitType?.name ?? context.appConfig.defaultVisitType}</strong><span>{context.mode === "retrospective" ? "Entrada retrospectiva" : context.mode === "historical" ? "Editando encuentro" : context.mode === "program" ? "Programa" : context.visit ? "Visita activa" : "Sin visita abierta"}</span></div><div className="toolbar"><Button outlined label="Dashboard" icon="pi pi-th-large" onClick={() => navigate(`/clinical/patient/${context.patientUuid}/dashboard${context.visit?.uuid ? `?visitUuid=${context.visit.uuid}` : ""}`)} /><Button outlined label="Documentos" icon="pi pi-file" onClick={() => setDocumentsOpen(true)} />{context.appConfig.quickPrints ? <><Menu model={printItems} popup ref={printMenu} /><Button outlined label="Imprimir" icon="pi pi-print" aria-label="Imprimir" onClick={(event) => printMenu.current?.toggle(event)} /></> : <Button outlined icon="pi pi-print" aria-label="Imprimir" onClick={() => window.print()} />}{context.appConfig.allowAdhocTeleConsultation && <Button outlined icon="pi pi-video" aria-label="Teleconsulta" onClick={() => void teleconsult()} />}<Button label="Guardar" icon="pi pi-save" loading={save.isPending} disabled={ambiguousSave || (!isDirty && !conditionsPendingRetry) || save.isPending} onClick={() => save.mutate()} /></div></section>
      <nav className="consultation-tabs" aria-label="Tableros de consulta">{visibleBoards.map((board) => <Button key={board.id} text={board.slug !== current.slug} severity={board.slug === current.slug ? undefined : "secondary"} label={String(t(board.translationKey ?? board.label, { defaultValue: board.label }))} disabled={board.slug !== current.slug && board.slug !== "summary" && (board.slug === "orders" || board.slug === "bacteriology" || board.slug === "disposition") && context.mode === "retrospective"} onClick={() => navigateBoard(board)} />)}</nav>
    </div>
    {message && <p role={message.kind === "error" ? "alert" : "status"} className={`${message.kind === "error" ? "error" : message.kind === "warning" ? "warning" : "success"}-banner`}>{message.text}</p>}
    <main className="consultation-board" id={`consultation-board-${current.slug}`}><ConsultationBoard slug={current.slug} /></main>
    <footer className="consultation-actions"><Button outlined label="Volver al dashboard" onClick={() => navigate(`/clinical/patient/${context.patientUuid}/dashboard${context.visit?.uuid ? `?visitUuid=${context.visit.uuid}` : ""}`)} />{ambiguousSave && <Button outlined severity="warning" label="Recargar y verificar" icon="pi pi-refresh" onClick={() => router.reload()} />}<Button label="Guardar" icon="pi pi-save" loading={save.isPending} disabled={ambiguousSave || (!isDirty && !conditionsPendingRetry) || save.isPending} onClick={() => save.mutate()} /></footer>
    <Dialog header="Cambios sin guardar" visible={navigationOpen} modal closable={!save.isPending} onHide={() => setNavigationOpen(false)} footer={<div className="toolbar"><Button outlined label="Cancelar" onClick={() => setNavigationOpen(false)} /><Button outlined severity="secondary" label="Continuar sin guardar" onClick={() => void continueWithoutSaving()} /><Button label="Guardar y continuar" icon="pi pi-save" loading={save.isPending} onClick={() => void saveAndContinue()} /></div>}><p>Hay cambios clínicos sin guardar. Seleccione cómo desea continuar.</p></Dialog>
    <Sidebar visible={documentsOpen} position="right" className="consultation-documents-sidebar" header="Documentos del paciente" onHide={() => setDocumentsOpen(false)}>
      <div className="toolbar"><Button label="Cargar documento" icon="pi pi-upload" disabled={!hasPrivilege(context.user, "app:patient-documents")} onClick={() => window.location.assign(documentUploadUrl)} /></div>
      {documents.isLoading && <div className="centered"><ProgressSpinner /><p>Cargando documentos…</p></div>}
      {documents.isError && <p role="alert" className="error-banner">No fue posible cargar los documentos del paciente.</p>}
      {documents.data?.map((document) => <article className="consultation-document-row" key={document.uuid}><div><strong>{document.concept}</strong>{document.date && <small>{new Intl.DateTimeFormat(context.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.date))}</small>}{document.comment && <p>{document.comment}</p>}</div><a className="p-button p-component p-button-outlined p-button-icon-only" href={document.valueUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${document.concept}`}><span className="p-button-icon pi pi-external-link" aria-hidden="true" /></a></article>)}
      {documents.isSuccess && documents.data.length === 0 && <p className="empty-state">No hay documentos registrados.</p>}
    </Sidebar>
  </div>;
}

function consultationQuery(context: ConsultationContextValue): Record<string, string> {
  return Object.fromEntries(Object.entries({ configName: context.configName, visitUuid: context.visit?.uuid, programUuid: context.programUuid, enrollment: context.enrollmentUuid, dateEnrolled: context.dateEnrolled, dateCompleted: context.dateCompleted, retrospectiveDate: context.retrospectiveDate }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])));
}

export default function ConsultationPage() {
  useClinicalTranslations();
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const patientUuid = queryValue(router.query.patientUuid) ?? "";
  const requestedBoard = queryValue(router.query.board);
  const board = consultationBoardSlugs.includes(requestedBoard as ConsultationBoardSlug) ? requestedBoard as ConsultationBoardSlug : "observations";
  const configName = queryValue(router.query.configName) ?? (queryValue(router.query.programUuid) ? "programs" : "default");
  const encounterUuid = queryValue(router.query.encounterUuid);
  const requestedVisitUuid = queryValue(router.query.visitUuid);
  const programUuid = queryValue(router.query.programUuid);
  const enrollmentUuid = queryValue(router.query.enrollment);
  const dateEnrolled = queryValue(router.query.dateEnrolled);
  const dateCompleted = queryValue(router.query.dateCompleted);
  const retrospectiveDate = queryValue(router.query.retrospectiveDate);
  const allowed = hasPrivilege(user, "app:clinical");
  const encounterProvider = useMemo(() => getGrantedEncounterProvider(user) ?? provider, [provider, user]);
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const visits = useQuery({ queryKey: ["clinical-visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const visitLocation = useQuery({ queryKey: ["visit-location", location?.uuid], queryFn: () => getVisitLocation(location!.uuid), enabled: allowed && Boolean(location?.uuid) });
  const appConfigQuery = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical"), enabled: allowed });
  const medicationQuery = useQuery({ queryKey: ["app-file", "clinical", "medication.json"], queryFn: () => loadAppFile("clinical", "medication.json"), enabled: allowed });
  const extensionsQuery = useQuery({ queryKey: ["consultation-extensions", configName], queryFn: async () => configName === "programs" ? extensionsFromObject(await loadAppFile("clinical", "extension-programs.json")) : loadExtensions("clinical"), enabled: allowed });
  const baseVisit = baseConsultationVisit({ visits: visits.data ?? [], requestedVisitUuid, visitLocationUuid: visitLocation.data?.uuid, encounterUuid, retrospectiveDate });
  const requestedMode = consultationMode({ encounterUuid, retrospectiveDate, programUuid, visitUuid: baseVisit?.uuid });
  const appConfig = appConfigQuery.data ? parseConsultationAppConfig(appConfigQuery.data) : undefined;
  const encounterType = useQuery({ queryKey: ["consultation-encounter-type", programUuid, location?.uuid], queryFn: () => resolveConsultationEncounterType({ programUuid, locationUuid: location!.uuid }), enabled: allowed && Boolean(location?.uuid) });
  const encounter = useQuery({ queryKey: ["consultation-encounter", patientUuid, encounterUuid, baseVisit?.uuid, enrollmentUuid, retrospectiveDate, encounterType.data?.uuid, location?.uuid, encounterProvider?.uuid], queryFn: () => encounterUuid && encounterUuid !== "active" ? getConsultationEncounter(encounterUuid) : findActiveConsultationEncounter({ patientUuid, providerUuid: encounterProvider?.uuid, encounterTypeUuid: encounterType.data!.uuid, locationUuid: location!.uuid, enrollmentUuid, visitUuid: baseVisit?.uuid, encounterDate: retrospectiveDate }), enabled: allowed && Boolean(patientUuid && encounterType.data?.uuid && location?.uuid) });
  const historicalVisitUuid = requestedMode === "historical" ? encounterVisitUuid(encounter.data) : undefined;
  const selectedVisit = baseVisit ?? (historicalVisitUuid ? (visits.data ?? []).find((visit) => visit.uuid === historicalVisitUuid) : undefined);
  const mode = consultationMode({ encounterUuid, retrospectiveDate, programUuid, visitUuid: selectedVisit?.uuid });
  // Legacy getPastAndCurrentDiagnoses intentionally reads the complete patient
  // history and separates it by encounter in the client.
  const diagnoses = useQuery({ queryKey: ["clinical-diagnoses", patientUuid], queryFn: () => getPatientDiagnoses(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const conditions = useQuery({ queryKey: ["clinical-condition-history", patientUuid], queryFn: () => getPatientConditionHistory(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const noteConcepts = useQuery({ queryKey: ["consultation-note-concepts"], queryFn: getConsultationNoteConcepts, enabled: allowed });
  const loading = profile.isLoading || visits.isLoading || visitLocation.isLoading || appConfigQuery.isLoading || medicationQuery.isLoading || extensionsQuery.isLoading || encounterType.isLoading || encounter.isLoading || diagnoses.isLoading || conditions.isLoading || noteConcepts.isLoading;
  const errorDomains = [
    profile.isError && "paciente", visits.isError && "visitas", appConfigQuery.isError && "configuración clínica",
    medicationQuery.isError && "configuración de medicamentos", extensionsQuery.isError && "pestañas de consulta",
    encounterType.isError && "tipo de encuentro", encounter.isError && "encuentro", diagnoses.isError && "diagnósticos",
    conditions.isError && "condiciones", noteConcepts.isError && "conceptos de notas",
  ].filter((value): value is string => Boolean(value));
  const hasError = errorDomains.length > 0;
  const clinicalPatient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const context = useMemo<ConsultationContextValue | undefined>(() => {
    if (!user || !location || !clinicalPatient || !appConfig || !medicationQuery.data || !extensionsQuery.data) return undefined;
    return { patientUuid, patient: clinicalPatient, visit: selectedVisit, visits: visits.data ?? [], mode, configName, programUuid, enrollmentUuid, dateEnrolled, dateCompleted, retrospectiveDate, user, provider: encounterProvider, location, locale: user.userProperties?.defaultLocale ?? "es", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago", appConfig, medicationConfig: parseMedicationConfig(medicationQuery.data), boards: parseConsultationBoards(extensionsQuery.data), forms: parseConsultationForms(extensionsQuery.data) };
  }, [appConfig, clinicalPatient, configName, dateCompleted, dateEnrolled, encounterProvider, enrollmentUuid, extensionsQuery.data, location, medicationQuery.data, mode, patientUuid, programUuid, retrospectiveDate, selectedVisit, user, visits.data]);
  const initialDraft = useMemo(() => {
    const value = createConsultationDraft(encounter.data ?? {}, diagnoses.data ?? [], conditions.data ?? []);
    value.visitUuid = value.visitUuid ?? selectedVisit?.uuid;
    value.locationUuid = value.locationUuid ?? location?.uuid;
    value.providers = value.providers.length ? value.providers : encounterProvider?.uuid ? [{ uuid: encounterProvider.uuid }] : [];
    const consultation = noteConcepts.data?.consultation;
    const labOrder = noteConcepts.data?.labOrder;
    const followUp = noteConcepts.data?.followUp;
    const encounterObservations = recordList(encounter.data?.observations);
    value.consultationNoteConcept = consultation ? { uuid: String(consultation.uuid), name: typeof consultation.name === "string" ? consultation.name : (consultation.name as { name?: string } | undefined)?.name } : undefined;
    value.labOrderNoteConcept = labOrder ? { uuid: String(labOrder.uuid), name: typeof labOrder.name === "string" ? labOrder.name : (labOrder.name as { name?: string } | undefined)?.name } : undefined;
    value.consultationNoteObservation = encounterObservations.find((observation) => (observation.concept as { uuid?: string } | undefined)?.uuid === value.consultationNoteConcept?.uuid && observation.voided !== true);
    value.labOrderNoteObservation = encounterObservations.find((observation) => (observation.concept as { uuid?: string } | undefined)?.uuid === value.labOrderNoteConcept?.uuid && observation.voided !== true);
    value.consultationNote = typeof value.consultationNoteObservation?.value === "string" ? value.consultationNoteObservation.value : value.consultationNote;
    value.labOrderNote = typeof value.labOrderNoteObservation?.value === "string" ? value.labOrderNoteObservation.value : value.labOrderNote;
    value.followUpConditionConcept = followUp ? { uuid: String(followUp.uuid), name: typeof followUp.name === "string" ? followUp.name : (followUp.name as { name?: string } | undefined)?.name } : undefined;
    value.followUpConditions = value.followUpConditionConcept
      ? encounterObservations.filter((observation) => (observation.concept as { uuid?: string } | undefined)?.uuid === value.followUpConditionConcept?.uuid && observation.voided !== true)
      : [];
    const followedConditionUuids = new Set(value.followUpConditions.flatMap((observation) => typeof observation.value === "string" ? [observation.value] : []));
    value.conditions = value.conditions.map((condition) => ({ ...condition, isFollowUp: Boolean(condition.uuid && followedConditionUuids.has(condition.uuid)) }));
    return value;
  }, [conditions.data, diagnoses.data, encounter.data, encounterProvider, location, noteConcepts.data, selectedVisit]);

  return <AuthGuard><AppShell mainClassName="consultation-page">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:clinical.</p>}
    {allowed && loading && <div className="centered"><ProgressSpinner /><p>Cargando consulta clínica…</p></div>}
    {allowed && hasError && <p role="alert" className="error-banner">No fue posible cargar completamente la consulta clínica. Dominios con error: {errorDomains.join(", ")}.</p>}
    {allowed && !loading && context && !selectedVisit && !context.appConfig.allowConsultationWhenNoOpenVisit && <p role="alert" className="warning-banner">La configuración no permite consultas sin visita abierta.</p>}
    {allowed && !loading && context && (selectedVisit || context.appConfig.allowConsultationWhenNoOpenVisit) && <ConsultationProvider key={`${patientUuid}:${encounter.data?.encounterUuid ?? encounterUuid ?? retrospectiveDate ?? "active"}`} context={context} initialDraft={initialDraft}><ConsultationWorkspace initialBoard={board} /></ConsultationProvider>}
  </AppShell></AuthGuard>;
}
