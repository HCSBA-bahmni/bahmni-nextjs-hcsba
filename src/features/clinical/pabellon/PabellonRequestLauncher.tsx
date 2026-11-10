import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { useEffect, useRef, useState } from "react";
import type { ClinicalDashboardContext } from "../dashboardContext";
import { getPabellonCatalogue } from "@/services/bahmni/pabellonCatalogues";
import { PabellonReadError, QA_PABELLON_SOURCE, type PabellonSource } from "@/services/bahmni/pabellon";
import { getVisitDetails } from "@/services/bahmni/visits";
import { PabellonSubmission, PabellonSubmissionError, getPendingPabellonReference, type PabellonSubmissionContext, type PabellonSubmissionInput, type PabellonSubmissionPhase, type PabellonSubmissionReceipt } from "@/services/bahmni/pabellonSubmission";
import { PabellonPatientContactFields } from "./PabellonPatientContactFields";
import { PabellonRequestFields } from "./PabellonRequestFields";
import { PabellonSurgeonFields } from "./PabellonSurgeonFields";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
import { loadPabellonPatientContact } from "./pabellonPatientPrefill";
import { verifyPabellonSelections, PabellonSelectionChangedError } from "./pabellonVerifySelections";
import { buildPabellonPatientDetails, emptyPabellonContactDraft } from "./pabellonContactDraft";
import { mergePabellonContact, patchPabellonContact, type PabellonContactOverrides } from "./pabellonContactOverrides";
import { buildPabellonClinicalFields, emptyPabellonClinicalDraft } from "./pabellonClinicalDraft";
import { buildPabellonSurgeonFields, emptyPabellonSurgeonDraft } from "./pabellonSurgeonDraft";
import { ClinicalBlock, ClinicalField } from "./PabellonClinicalBlock";
import styles from "./PabellonRequest.module.css";
import { formatPabellonDate, formatPabellonVisit } from "./pabellonDates";
import { PabellonRequestLink } from "./PabellonRequestLink";
import { applyFirstProcedureType, applySurgeonSpecialty, insuranceCareDefault } from "./pabellonAutofill";
import { getPabellonPersonasPrefill } from "@/services/bahmni/pabellonPersonas";
import { mapPersonasPrefill } from "./pabellonPersonasPrefill";
import { applyComgesPriority } from "./pabellonComges";

interface Props { context: ClinicalDashboardContext; source?: PabellonSource; onCreated(): void; compact?: boolean; autoOpen?: boolean }
const validUUID = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
class PabellonVisitChangedError extends Error {
  constructor() { super("La atención ya no está activa o cambió. Actualice la ficha y revise la atención seleccionada. No se envió la solicitud."); }
}
const visitLabel = (visit: ClinicalDashboardContext["visits"][number], context: Pick<ClinicalDashboardContext, "locale" | "timeZone">) => {
  const start = formatPabellonVisit(visit.startDatetime, context.timeZone);
  return (visit.visitType?.display || "Atención") + " · " + start + (visit.stopDatetime ? " · Cerrada" : " · Activa");
};

export function PabellonRequestLauncher({ context, onCreated, source = QA_PABELLON_SOURCE, compact = false, autoOpen = false }: Props) {
  return <Launcher key={source.environment + ":" + (context.user?.uuid ?? "") + ":" + context.patient.uuid} source={source} context={context} onCreated={onCreated} compact={compact} autoOpen={autoOpen} />;
}
function Launcher({ context, onCreated, source = QA_PABELLON_SOURCE, compact = false, autoOpen = false }: Props) {
  const queryClient = useQueryClient();
  const actorUuid = context.user?.uuid ?? ""; const patientUuid = context.patient.uuid;
  const sourceEnvironment = source.environment;
  const scope = sourceEnvironment + ":" + actorUuid + ":" + patientUuid;
  const visits = (context.visits ?? []).filter((visit) => validUUID(visit.uuid) && visit.voided !== true && (!visit.patient?.uuid || visit.patient.uuid === patientUuid));
  const activeVisit = context.visit && !context.visit.stopDatetime && visits.some((visit) => visit.uuid === context.visit?.uuid) ? context.visit : undefined;
  const pending = getPendingPabellonReference({ actorUuid, patientUuid, sourceEnvironment });
  const pendingSendId = pending?.sendId;
  const [visible, setVisible] = useState(false);
  const [restore, setRestore] = useState(false);
  const [formContext, setFormContext] = useState<PabellonSubmissionContext | null>(null);
  const [visitId, setVisitId] = useState("");
  const [reference, setReference] = useState("");
  const [clinicalDraft, setClinical] = useState(emptyPabellonClinicalDraft);
  const [careSelectionKey, setCareSelectionKey] = useState<string | null>(null);
  const [surgeon, setSurgeon] = useState(emptyPabellonSurgeonDraft);
  const [contactOverrides, setContactOverrides] = useState<PabellonContactOverrides>({});
  const [patientSource, setPatientSource] = useState<string | null>(null);
  const [checkingSelections, setCheckingSelections] = useState(false);
  const [review, setReview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submissionState, setSubmissionState] = useState<{ phase?: PabellonSubmissionPhase; sendId?: string; receipt?: PabellonSubmissionReceipt }>({});
  const session = useRef<PabellonSubmission | null>(null);
  const actionInFlight = useRef(false);
  const reviewInFlight = useRef(false);
  const reviewAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; reviewAbort.current?.abort(); }; }, []);
  const syncSession = () => setSubmissionState(session.current ? { phase: session.current.phase, sendId: session.current.sendId, receipt: session.current.receipt } : {});
  const phase = submissionState.phase;
  const busy = phase === "submitting" || phase === "recovering" || checkingSelections;
  const uncertain = phase === "recovery-required";
  const receipt = submissionState.receipt;
  const locked = busy || uncertain || Boolean(receipt);
  useEffect(() => {
    if (!dirty && !busy && !uncertain && !pendingSendId) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, busy, uncertain, pendingSendId]);
  const capability = useQuery({
    queryKey: ["pabellon-create-capability", sourceEnvironment, actorUuid, patientUuid], enabled: validUUID(actorUuid) && validUUID(patientUuid) && (visits.length > 0 || Boolean(pending)),
    queryFn: ({ signal }) => getPabellonCatalogue("theatres", { limit: 1, signal }),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const allowed = capability.isSuccess;
  const dependencies = useQuery({
    queryKey: ["pabellon-form-dependencies", sourceEnvironment, actorUuid, patientUuid], enabled: allowed && visible && !restore,
    queryFn: async ({ signal }) => {
      const [specialties, surgeryTypes, careTypes] = await Promise.all([loadPabellonSmallCatalogue("specialties", signal), loadPabellonSmallCatalogue("surgery-types", signal), loadPabellonSmallCatalogue("care-types", signal)]);
      return { specialties, surgeryTypes, careTypes };
    },
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const patientContact = useQuery({
    queryKey: ["pabellon-patient-registry", sourceEnvironment, actorUuid, patientUuid],
    enabled: allowed && visible && !restore && !review && !locked,
    queryFn: ({ signal }) => loadPabellonPatientContact(context.patient, signal),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const personas = useQuery({
    queryKey: ["pabellon-personas-prefill", sourceEnvironment, actorUuid, patientUuid],
    enabled: sourceEnvironment === "pabellon43-dev" && allowed && visible && !restore && !review && !locked,
    queryFn: async ({ signal }) => {
      const [data, communes, insurances, sexes, priorities] = await Promise.all([getPabellonPersonasPrefill(patientUuid, signal), loadPabellonSmallCatalogue("communes", signal), loadPabellonSmallCatalogue("insurances", signal), loadPabellonSmallCatalogue("sexes", signal), loadPabellonSmallCatalogue("patient-priorities", signal)]);
      return { data, masters: { communes, insurances, sexes, priorities } };
    },
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const appliedComgesDigest = useRef<string | null>(null);
  useEffect(() => {
    const result = personas.data;
    if (!result || result.data.record.comgesMatch !== true || locked || review || appliedComgesDigest.current === result.data.digest) return;
    appliedComgesDigest.current = result.data.digest;
    setClinical(previous => applyComgesPriority(previous, true, result.masters.priorities));
  }, [personas.data, locked, review]);
  const personasMapped = personas.data ? mapPersonasPrefill(personas.data.data, patientContact.data?.patient ?? context.patient, personas.data.masters) : undefined;
  const selectedPersonas = patientSource !== null && patientSource !== "his" && personas.data?.data.digest === patientSource;
  const identityConflict = personas.isError && "code" in personas.error && ["PERSONAS_IDENTITY_CONFLICT", "PATIENT_CONTEXT_MISMATCH"].includes(String(personas.error.code));
  const selectedContact = selectedPersonas ? personasMapped : patientContact.data;
  const contactBase = selectedContact?.draft ?? emptyPabellonContactDraft();
  const choosePatientSource = (value: string) => {
    if (locked || review || value === patientSource) return;
    if (Object.keys(contactOverrides).length && !window.confirm("Cambiar la fuente reemplazará las correcciones de datos del paciente hechas en esta solicitud. ¿Continuar?")) return;
    setPatientSource(value); setContactOverrides({}); setDirty(true);
  };
  const contact = mergePabellonContact(contactBase, contactOverrides);
  const insuranceKey = contact.insurance ? contact.insurance.system + ":" + contact.insurance.sourceId + ":" + contact.insurance.code : "";
  const defaultCare = insuranceCareDefault(contact.insurance?.code, dependencies.data?.careTypes ?? []);
  const clinical = careSelectionKey === insuranceKey ? clinicalDraft : { ...clinicalDraft, selections: { ...clinicalDraft.selections, "care-types": defaultCare ? [defaultCare] : [] } };
  const approachTypes = useQuery({
    queryKey: ["pabellon-approach-types", sourceEnvironment, actorUuid, patientUuid],
    enabled: allowed && visible && !restore && Boolean(clinical.selections["surgical-approaches"].length),
    queryFn: ({ signal }) => loadPabellonSmallCatalogue("approach-types", signal),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const restorePending = () => {
    const saved = getPendingPabellonReference({ actorUuid, patientUuid, sourceEnvironment });
    if (!saved) return false;
    session.current = new PabellonSubmission(saved.context, saved.sendId); setFormContext({ ...saved.context });
    syncSession();
    setRestore(false); setErrors([]); setVisible(true); setReview(false); return true;
  };
  const openCreate = () => {
    if (restorePending()) return;
    if (!activeVisit || !allowed) return;
    if (!formContext || receipt) {
      setCareSelectionKey(null);
      session.current = null; setClinical(emptyPabellonClinicalDraft()); setSurgeon(emptyPabellonSurgeonDraft());
      setContactOverrides({});
      setPatientSource(null);
      syncSession();
      setFormContext({ actorUuid, patientUuid, sourceEnvironment, visitUuid: activeVisit.uuid, encounterUuid: "" });
      setReview(false); setDirty(false); setErrors([]);
    }
    setRestore(false); setVisible(true);
  };
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpen && allowed && activeVisit && !autoOpened.current) {
      autoOpened.current = true;
      openCreate();
    }
  });
  const build = (): PabellonSubmissionInput | null => {
    if (identityConflict) { setErrors(["La identidad de Personas requiere revisión. No se puede registrar esta solicitud hasta resolverla."]); return null; }
    if (sourceEnvironment === "pabellon43-dev" && (!patientSource || patientSource !== "his" && (!selectedPersonas || personas.isFetching))) {
      setErrors(["Confirme la fuente de datos del paciente. Si la precarga cambió, revísela y confírmela nuevamente."]); return null;
    }
    if (!dependencies.isSuccess || dependencies.isFetching) { setErrors(["Falta verificar las relaciones automáticas de Pabellón."]); return null; }
    if (!patientContact.isSuccess || patientContact.isFetching) {
      setErrors(["Falta cargar y verificar los datos del Registro del paciente."]);
      return null;
    }
    const c = buildPabellonPatientDetails(contact); const f = buildPabellonClinicalFields(clinical, approachTypes.data); const s = buildPabellonSurgeonFields(surgeon);
    setErrors([...c.errors, ...f.errors, ...s.errors]);
    if (!c.details || !f.fields || !s.fields) return null;
    const fields = { ...f.fields };
    if (typeof s.fields.cirujano === "number") fields.cirujano = s.fields.cirujano;
    else fields.nombre_cirujano = s.fields.nombre_cirujano!;
    return { patientDetails: { ...c.details, ...(selectedPersonas ? { personasDigest: personas.data!.data.digest } : {}) }, clinical: fields };
  };
  const prepareReview = async () => {
    if (reviewInFlight.current || locked || restore || !formContext) return;
    const input = build(); if (!input) return;
    reviewInFlight.current = true; setCheckingSelections(true);
    const controller = new AbortController(); reviewAbort.current = controller;
    try {
      const current = await getVisitDetails(formContext.visitUuid, controller.signal);
      if (current.uuid !== formContext.visitUuid || current.voided !== false || current.stopDatetime !== null || current.patient?.uuid && current.patient.uuid !== patientUuid) {
        await queryClient.invalidateQueries({ queryKey: ["clinical-visits", patientUuid] });
        throw new PabellonVisitChangedError();
      }
      await verifyPabellonSelections(clinical, surgeon, input, controller.signal);
      if (mounted.current && !controller.signal.aborted) setReview(true);
    } catch (error) {
      controller.abort();
      if (mounted.current) setErrors([error instanceof PabellonReadError || error instanceof PabellonSelectionChangedError || error instanceof PabellonVisitChangedError ? error.message : error instanceof Error && error.name !== "AbortError" ? "No se pudo verificar la atención o las opciones de Pabellón. Revise las selecciones y vuelva a intentar." : "Se canceló la verificación de catálogos."]);
    } finally { reviewInFlight.current = false; if (mounted.current) setCheckingSelections(false); }
  };
  const run = (recovery: boolean) => {
    if (actionInFlight.current || busy || !formContext) return;
    let work: Promise<unknown>;
    try {
      if (recovery) {
        if (!session.current) return;
        work = session.current.recover(formContext);
      } else {
        const input = build(); if (!input || !review) return;
        session.current ??= new PabellonSubmission(formContext);
        work = session.current.submit(formContext, input);
      }
    } catch (error) {
      setErrors([error instanceof PabellonSubmissionError ? error.message : "No fue posible preparar el envío."]); return;
    }
    actionInFlight.current = true;
    syncSession();
    void work.then(() => {
      if (!mounted.current) return;
      setDirty(false); setErrors([]); onCreated();
    }).catch((error: unknown) => {
      if (!mounted.current) return;
      if (error instanceof PabellonSubmissionError && error.code === "PENDING_SEND_EXISTS") { restorePending(); return; }
      setErrors([error instanceof PabellonSubmissionError ? error.message : "No fue posible confirmar el resultado. Verifique el mismo envío."]);
      if (session.current?.phase === "editable") setReview(false);
    }).finally(() => { actionInFlight.current = false; if (mounted.current) syncSession(); });
  };
  const restoreReference = () => {
    if (!validUUID(reference) || !visits.some((visit) => visit.uuid === visitId)) { setErrors(["Ingrese la referencia de envío y seleccione su atención original."]); return; }
    const original = { actorUuid, patientUuid, sourceEnvironment, visitUuid: visitId, encounterUuid: "" };
    // Reference import is recovery-only; no clinical payload/new POST is allowed.
    try { session.current = new PabellonSubmission(original, reference); syncSession(); setFormContext(original); setRestore(false); setReview(false); setErrors([]); }
    catch { setErrors(["La referencia o el contexto no son válidos."]); }
  };
  const visit = visits.find((value) => value.uuid === formContext?.visitUuid);
  const snapshotReadOnly = review || locked;
  if (compact && (!allowed || !activeVisit)) return null;
  return <section aria-label="Solicitar pabellón desde HIS" className={compact ? styles.sidebarRequest : styles.requestArea}>
    <div className="dashboard-inline-actions">
      {!compact && <PabellonRequestLink context={context} disabled={!allowed || busy} onChanged={onCreated} />}
      <Button type="button" label={pending ? "Verificar envío pendiente" : formContext && !receipt ? "Continuar borrador" : "Solicitar pabellón"}
        icon="pi pi-file-edit" outlined={compact} loading={capability.isFetching} disabled={!pending && (!allowed || !activeVisit)} onClick={openCreate} />
      {!compact && <Button type="button" text label="Recuperar envío por referencia" icon="pi pi-history" disabled={!allowed || busy || Boolean(pending)} onClick={() => { setRestore(true); setVisible(true); setErrors([]); }} />}
    </div>
    {!activeVisit && <p>Seleccione una atención activa para crear una solicitud electiva. La recuperación utiliza la atención original, incluso cerrada.</p>}
    {capability.isError && <div role="alert"><p>{capability.error instanceof PabellonReadError ? capability.error.message : "No fue posible verificar la autorización para solicitar Pabellón."}</p>
      <Button type="button" text label="Revisar autorización" loading={capability.isFetching} disabled={capability.isFetching} onClick={() => { void capability.refetch({ cancelRefetch: false }); }} /></div>}
    <Dialog draggable={false} header={restore ? "Recuperar solicitud enviada" : "Solicitud de quirófano — HIS"} modal blockScroll maximizable
      visible={visible} closeOnEscape={!busy} closable={!busy} onHide={() => { if (!busy) setVisible(false); }}
      style={{ width: "min(1500px, 96vw)" }} footer={<div className="dashboard-inline-actions">
        {!busy && <Button type="button" text label={receipt ? "Cerrar" : "Minimizar"} onClick={() => setVisible(false)} />}
        {restore ? <Button type="button" label="Preparar recuperación" onClick={restoreReference} /> : receipt ? null : uncertain ?
          <Button type="button" label="Verificar mismo envío" icon="pi pi-refresh" loading={busy} disabled={busy} onClick={() => run(true)} /> :
          checkingSelections ? <Button type="button" label="Verificando catálogos" loading disabled /> : busy ? <Button type="button" label="Procesando solicitud" loading disabled /> :
          review ? <><Button type="button" text label="Volver a editar" onClick={() => setReview(false)} /><Button type="button" label="Enviar solicitud a Pabellón" icon="pi pi-send" onClick={() => run(false)} /></> :
          <Button type="button" label="Revisar solicitud" icon="pi pi-check" loading={approachTypes.isFetching || patientContact.isFetching || dependencies.isFetching} disabled={approachTypes.isFetching || patientContact.isFetching || !dependencies.isSuccess} onClick={() => { void prepareReview(); }} />}
      </div>}>
      <p role="note" className="warning-banner">{sourceEnvironment === "pabellon43-dev" ? "Pabellón DEV: entorno de desarrollo, no utilizar para atención clínica." : "QA: solo pacientes y datos sintéticos."} La programación se realiza en Pabellón.</p>
      {errors.length > 0 && <div role="alert" className="error-banner"><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      {restore ? <div className={styles.grid}>
        <div className={styles.field}><label htmlFor="pabellon-restore-reference">Referencia del envío *</label><InputText id="pabellon-restore-reference" value={reference} onChange={(event) => setReference(event.target.value.trim())} maxLength={36} /></div>
        <div className={styles.field}><label htmlFor="pabellon-restore-visit">Atención original *</label><Dropdown inputId="pabellon-restore-visit" options={visits.map((item) => ({ label: visitLabel(item, context), value: item.uuid }))} value={visitId} onChange={(event) => setVisitId(event.value)} placeholder="Seleccione" /></div>
        <p>La referencia no es el número de solicitud. Verificarla no crea otra cirugía ni reenvía sus datos clínicos.</p>
      </div> : <>
        <ClinicalBlock title="Contexto de la nueva solicitud" icon="pi-id-card"><dl className={styles.grid}>
          <ClinicalField title="Paciente actual del HIS">{context.patient.name}</ClinicalField>
          <ClinicalField title="Atención original">{visit ? visitLabel(visit, context) : formContext?.visitUuid}</ClinicalField>
        </dl><p>El servidor verifica la identidad por RUT y conserva la atención del HIS. La fuente confirmada se guarda solo en la fotografía de esta nueva solicitud.</p></ClinicalBlock>
        {submissionState.sendId && <ClinicalBlock title="Referencia del envío" icon="pi-link">
          <p>La referencia se conserva automáticamente en este navegador. Si el resultado queda pendiente, vuelva a este paciente con el mismo usuario y pulse «Verificar envío pendiente». No es un número de solicitud.</p>
          <InputText aria-label="Referencia técnica del envío" readOnly value={submissionState.sendId} className={styles.reference} />
          {uncertain && <p role="status">Resultado pendiente de confirmar. No se habilita otro envío. Si no hay recibo todavía, conserve la referencia y solicite revisión antes de crear otra solicitud.</p>}
        </ClinicalBlock>}
        {receipt ? <div role="status" className="success-banner"><h3>Solicitud registrada: {receipt.result.requestNumber}</h3><p>Estado inicial: Solicitud ingresada. El resultado fue confirmado por Pabellón.</p></div> :
        uncertain || phase === "recovering" ? null : <>
          {review && <p role="status" className="info-banner">Revise los datos. Todavía no se ha enviado la solicitud.</p>}
          {sourceEnvironment === "pabellon43-dev" && <ClinicalBlock title="Confirmar datos del paciente" icon="pi-id-card">
            <p>Consultamos Personas por el RUT verificado. Esta operación no modifica Personas ni la ficha del HIS.</p>
            {personas.isFetching && <p role="status">Consultando Personas y verificando sus datos…</p>}
            {personas.isError && <p role="alert">{personas.error.message}</p>}
            {personas.data && <>
              <dl className={styles.grid}>
                <ClinicalField title="Nombre en HIS">{patientContact.data?.patient.name ?? context.patient.name}</ClinicalField>
                <ClinicalField title="Nombre en Personas">{personasMapped?.patient.name}</ClinicalField>
                <ClinicalField title="Nacimiento en HIS">{formatPabellonDate(patientContact.data?.patient.birthDate ?? context.patient.birthDate)}</ClinicalField>
                <ClinicalField title="Nacimiento en Personas">{formatPabellonDate(personas.data.data.record.birthDate)}</ClinicalField>
              </dl>
              <dl className={styles.grid}>
                <ClinicalField title="Teléfono en HIS">{patientContact.data?.draft.telephone}</ClinicalField><ClinicalField title="Teléfono en Personas">{personas.data.data.record.telephone}</ClinicalField>
                <ClinicalField title="Dirección en HIS">{[patientContact.data?.draft.address, patientContact.data?.draft.addressNumber].filter(Boolean).join(" ")}</ClinicalField><ClinicalField title="Dirección en Personas">{[personas.data.data.record.address, personas.data.data.record.addressNumber].filter(Boolean).join(" ")}</ClinicalField>
                <ClinicalField title="Comuna en HIS">{patientContact.data?.draft.commune?.display}</ClinicalField><ClinicalField title="Comuna en Personas">{personasMapped?.draft.commune?.display || "Sin correspondencia; seleccione en el formulario"}</ClinicalField>
                <ClinicalField title="Previsión en HIS">{patientContact.data?.draft.insurance?.display}</ClinicalField><ClinicalField title="Previsión en Personas">{personasMapped?.draft.insurance?.display || "Sin correspondencia; seleccione en el formulario"}</ClinicalField>
              </dl>
              {(personasMapped?.differences.length ?? 0) > 0 && <p role="alert" className="warning-banner">Diferencias con HIS: {personasMapped!.differences.join(", ")}. Revise antes de confirmar.</p>}
              <Button type="button" label={selectedPersonas ? "Datos de Personas confirmados" : "Usar datos de Personas"} icon="pi pi-check" outlined={!selectedPersonas} disabled={snapshotReadOnly || personas.isFetching} onClick={() => choosePatientSource(personas.data!.data.digest)} />
            </>}
            <div className="dashboard-inline-actions">
              <Button type="button" text label="Volver a consultar Personas" icon="pi pi-refresh" loading={personas.isFetching} disabled={snapshotReadOnly || personas.isFetching} onClick={() => { void personas.refetch({ cancelRefetch: false }); }} />
              <Button type="button" text label={patientSource === "his" ? "Datos del HIS confirmados" : "Conservar datos del HIS"} disabled={snapshotReadOnly || identityConflict || personas.isFetching || !patientContact.isSuccess} onClick={() => choosePatientSource("his")} />
            </div>
          </ClinicalBlock>}
          {dependencies.isError && <div role="alert"><p>No se pudieron cargar las relaciones automáticas del formulario.</p><Button type="button" text label="Reintentar relaciones" loading={dependencies.isFetching} disabled={dependencies.isFetching || snapshotReadOnly} onClick={() => { void dependencies.refetch({ cancelRefetch: false }); }} /></div>}
          <PabellonRequestFields scopeKey={scope + ":" + formContext?.visitUuid} value={clinical} disabled={snapshotReadOnly || !dependencies.isSuccess} onChange={(value) => {
            setCareSelectionKey(insuranceKey);
            setClinical(applyFirstProcedureType(clinical, value, dependencies.data?.surgeryTypes ?? [])); setDirty(true);
          }}
            approachTypes={approachTypes.data} approachError={approachTypes.isError ? "No fue posible verificar los tipos de vía de abordaje." : undefined}
            onRetryApproaches={() => { void approachTypes.refetch({ cancelRefetch: false }); }}
            patientFields={<PabellonPatientContactFields scopeKey={scope} sourceLabel={selectedPersonas ? "Personas" : "Registro HIS"} patient={selectedContact?.patient ?? context.patient} value={contact} issues={selectedContact?.issues ?? []} overrides={contactOverrides}
              onChange={(patch) => { if (!snapshotReadOnly && patientContact.isSuccess && !patientContact.isFetching) { setContactOverrides((previous) => patchPabellonContact(contactBase, previous, patch)); setDirty(true); } }}
              loading={patientContact.isFetching} error={patientContact.isError} disabled={snapshotReadOnly}
              onRefresh={() => { if (!snapshotReadOnly) { void patientContact.refetch({ cancelRefetch: false }); } }} />}
            surgeonFields={<PabellonSurgeonFields embedded scopeKey={scope + ":" + formContext?.visitUuid} value={surgeon} disabled={snapshotReadOnly || !dependencies.isSuccess} onChange={(value) => {
              if (value.selected?.sourceId !== surgeon.selected?.sourceId || value.mode !== surgeon.mode) {
                setClinical((previous) => applySurgeonSpecialty(previous, value, dependencies.data?.specialties ?? []));
              }
              setSurgeon(value); setDirty(true);
            }} />} />
        </>}
      </>}
    </Dialog>
  </section>;
}
