import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useEffect, useRef, useState } from "react";
import { formatChileRun, validateChileRun } from "@/config-compat/validators";
import {
  lookupLocalPatientByRun, lookupMpiIdentityForAdmission, mpiPatientDisplay,
  type MpiLookup, type MpiPatient,
} from "@/services/mpi/admission";

export interface ConfirmedMpiIdentity { run?: string; patient?: MpiPatient; source?: string; crid?: string }

interface Props {
  onContinue(identity: ConfirmedMpiIdentity): void;
  onOpenExisting(patientUuid: string): void;
}

function PatientCard({ patient, label }: { patient: MpiPatient; label: string }) {
  const details = mpiPatientDisplay(patient);
  return <article className="mpi-admission-patient">
    <span>{label}</span>
    <strong>{details.name || "Nombre no informado"}</strong>
    <dl><div><dt>Sexo registral</dt><dd>{details.gender}</dd></div><div><dt>Nacimiento</dt><dd>{details.birthDate}</dd></div></dl>
  </article>;
}

export function MpiAdmissionGate({ onContinue, onOpenExisting }: Props) {
  const [run, setRun] = useState("");
  const [local, setLocal] = useState<MpiPatient[] | null>(null);
  const [mpi, setMpi] = useState<MpiLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otherDocumentChecked, setOtherDocumentChecked] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const changeRun = (value: string) => {
    controller.current?.abort();
    setLoading(false);
    setRun(value); setLocal(null); setMpi(null); setError(""); setOtherDocumentChecked(false);
  };
  const search = async () => {
    if (!validateChileRun(run)) return setError("Ingrese un RUN válido con dígito verificador.");
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true); setError(""); setLocal(null); setMpi(null);
    try {
      // A failed local lookup must never be interpreted as permission to create a new record.
      const localPatients = await lookupLocalPatientByRun(run, active.signal);
      if (active.signal.aborted) return;
      setLocal(localPatients);
      const lookup = await lookupMpiIdentityForAdmission(run, active.signal);
      if (!active.signal.aborted) setMpi(lookup);
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : "No fue posible verificar la identidad.");
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  };
  const formattedRun = formatChileRun(run);
  const localPatient = local?.length === 1 ? local[0] : undefined;
  const canOpenLocal = Boolean(localPatient?.id && mpi?.outcome !== "ambiguous");
  const canCreate = local?.length === 0 && mpi && !mpi.stale && (mpi.outcome === "match-unique" || (mpi.outcome === "no-match" && mpi.source === "minsal"));

  return <section className="panel mpi-admission-gate" aria-labelledby="mpi-admission-title">
    <div className="mpi-admission-heading"><span className="pi pi-id-card" aria-hidden="true" /><div><h2 id="mpi-admission-title">Verificación de identidad MPI</h2><p>Busque el RUN y coteje los datos con el documento antes de registrar una ficha.</p></div></div>
    <div className="toolbar mpi-admission-search"><div className="field"><label htmlFor="mpi-admission-run">RUN</label><InputText id="mpi-admission-run" value={run} placeholder="12345678-5" onChange={(event) => changeRun(event.target.value)} onBlur={() => setRun((current) => current ? formatChileRun(current) : current)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /></div><Button type="button" icon="pi pi-search" label="Consultar identidad" loading={loading} disabled={!run.trim()} onClick={() => void search()} /></div>
    {error && <p role="alert" className="error-banner">{error} Revise la búsqueda local y siga el procedimiento de contingencia; no cree una ficha a partir de esta consulta.</p>}
    {local && local.length > 1 && <p role="alert" className="error-banner">El RUN corresponde a varias fichas en OpenMRS. Se requiere resolver la duplicación antes de continuar.</p>}
    {mpi?.stale && <p role="alert" className="warning-banner">El MPI nacional no pudo confirmar la identidad. La información disponible puede estar desactualizada. No se permite crear una ficha nueva desde esta verificación.</p>}
    {mpi?.outcome === "ambiguous" && <p role="alert" className="error-banner">El MPI devolvió varias identidades para el RUN. Detenga el alta y solicite adjudicación.</p>}
    {mpi?.outcome === "no-match" && mpi.source !== "minsal" && !mpi.stale && <p role="alert" className="warning-banner">El índice interno no encontró una identidad, pero falta confirmación del MPI nacional. No cree una ficha nueva con este resultado.</p>}
    {mpi && <div className="mpi-admission-provenance"><span>Origen: {mpi.source === "minsal" ? "MPI nacional" : "MPI interno"}</span>{mpi.syncedAt && <span>Última consulta nacional: {new Date(mpi.syncedAt).toLocaleString("es-CL")}</span>}{mpi.crid && <span>CRID: {mpi.crid}</span>}{mpi.correlationId && <span>Traza: {mpi.correlationId}</span>}</div>}
    {(local?.length || mpi?.patients.length) ? <div className="mpi-admission-candidates">{local?.map((patient, index) => <PatientCard key={`local-${patient.id ?? index}`} patient={patient} label="Ficha OpenMRS" />)}{mpi?.patients.map((patient, index) => <PatientCard key={`mpi-${patient.id ?? index}`} patient={patient} label={mpi.source === "minsal" ? "MPI nacional" : "MPI interno"} />)}</div> : null}
    {mpi?.outcome === "no-match" && mpi.source === "minsal" && !mpi.stale && local?.length === 0 && <p className="success-banner">No se encontró ficha local ni identidad MPI para este RUN. Complete el formulario EIS con el documento a la vista.</p>}
    <div className="actions mpi-admission-actions">
      {canOpenLocal && <Button type="button" icon="pi pi-user" label="Abrir ficha existente" onClick={() => onOpenExisting(localPatient!.id!)} />}
      {canCreate && <Button type="button" icon="pi pi-check" label={mpi.outcome === "match-unique" ? "Confirmar identidad y completar EIS" : "Confirmar documento y completar EIS"} onClick={() => onContinue({ run: formattedRun, patient: mpi.outcome === "match-unique" ? mpi.patients[0] : undefined, source: mpi.source, crid: mpi.crid })} />}
    </div>
    <details className="mpi-admission-without-run"><summary>La persona no tiene RUN</summary><p>El mediador actual no permite pareo automático sin RUN. Busque primero la ficha por el documento disponible; si corresponde crearla, quedará pendiente de vinculación MPI.</p><label className="checkbox-row"><input type="checkbox" checked={otherDocumentChecked} onChange={(event) => setOtherDocumentChecked(event.target.checked)} /> Confirmo que revisé la búsqueda local con el documento presentado.</label><Button type="button" outlined label="Continuar sin RUN; identidad pendiente" disabled={Boolean(run.trim()) || !otherDocumentChecked} onClick={() => onContinue({})} /></details>
  </section>;
}
