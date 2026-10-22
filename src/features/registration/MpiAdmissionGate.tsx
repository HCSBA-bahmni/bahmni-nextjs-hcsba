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
  localIdentityEnabled?: boolean;
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

export function MpiAdmissionGate({ onContinue, onOpenExisting, localIdentityEnabled = false }: Props) {
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
    <div className="mpi-admission-heading"><span className="pi pi-id-card" aria-hidden="true" /><div><h2 id="mpi-admission-title">Verificar datos del paciente</h2><p>Busque el RUN y compare los datos con el documento presentado antes de registrar una ficha.</p></div></div>
    <div className="toolbar mpi-admission-search"><div className="field"><label htmlFor="mpi-admission-run">RUN</label><InputText id="mpi-admission-run" value={run} placeholder="12345678-5" onChange={(event) => changeRun(event.target.value)} onBlur={() => setRun((current) => current ? formatChileRun(current) : current)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /></div><Button type="button" icon="pi pi-search" label="Consultar identidad" loading={loading} disabled={!run.trim()} onClick={() => void search()} /></div>
    {error && <p role="alert" className="error-banner">{error} Revise la búsqueda local y siga el procedimiento de contingencia; no cree una ficha a partir de esta consulta.</p>}
    {local && local.length > 1 && <p role="alert" className="error-banner">El RUN aparece en varias fichas del hospital. Solicite al gestor que revise estas fichas antes de continuar.</p>}
    {mpi?.stale && <p role="alert" className="warning-banner">El MPI nacional no pudo confirmar la identidad. La información disponible puede estar desactualizada. No se permite crear una ficha nueva desde esta verificación.</p>}
    {mpi?.outcome === "ambiguous" && <p role="alert" className="error-banner">Se encontró más de una identidad con este RUN. Solicite revisión al gestor antes de crear una ficha.</p>}
    {mpi?.outcome === "no-match" && mpi.source !== "minsal" && !mpi.stale && <p role="alert" className="warning-banner">El índice interno no encontró una identidad, pero falta confirmación del MPI nacional. No cree una ficha nueva con este resultado.</p>}
    {mpi && <div className="mpi-admission-provenance"><span>{mpi.source === "minsal" ? "Datos consultados en MINSAL" : "Datos del registro de identidad del hospital"}</span>{mpi.syncedAt && <span>Consultado: {new Date(mpi.syncedAt).toLocaleString("es-CL")}</span>}</div>}
    {(local?.length || mpi?.patients.length) ? <div className="mpi-admission-candidates">{local?.map((patient, index) => <PatientCard key={`local-${patient.id ?? index}`} patient={patient} label="Ficha del hospital" />)}{mpi?.patients.map((patient, index) => <PatientCard key={`mpi-${patient.id ?? index}`} patient={patient} label={mpi.source === "minsal" ? "Datos informados por MINSAL" : "Registro de identidad del hospital"} />)}</div> : null}
    {mpi?.outcome === "no-match" && mpi.source === "minsal" && !mpi.stale && local?.length === 0 && <p className="success-banner">No se encontraron antecedentes para este RUN. Complete los datos del paciente con el documento a la vista.</p>}
    <div className="actions mpi-admission-actions">
      {canOpenLocal && <Button type="button" icon="pi pi-user" label="Abrir ficha existente" onClick={() => onOpenExisting(localPatient!.id!)} />}
      {canCreate && <Button type="button" icon="pi pi-check" label="Continuar con estos datos" onClick={() => onContinue({ run: formattedRun, patient: mpi.outcome === "match-unique" ? mpi.patients[0] : undefined, source: mpi.source, crid: mpi.crid })} />}
    </div>
    <details className="mpi-admission-without-run"><summary>La persona no tiene RUN</summary><p>{localIdentityEnabled ? "Puede registrarse con pasaporte u otro documento. Antes de guardar se buscarán posibles coincidencias. Si hay dudas, un gestor revisará la identidad y la ficha podrá seguir utilizándose." : "Busque primero la ficha con el documento disponible. Si corresponde crearla, la verificación de identidad quedará pendiente."}</p><label className="checkbox-row"><input type="checkbox" checked={otherDocumentChecked} onChange={(event) => setOtherDocumentChecked(event.target.checked)} /> Confirmo que revisé la búsqueda local con el documento presentado.</label><Button type="button" outlined label="Continuar con otro documento" disabled={Boolean(run.trim()) || !otherDocumentChecked} onClick={() => onContinue({})} /></details>
  </section>;
}
