import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useEffect, useState } from "react";
import {
  lookupLocalPatientByRun, lookupMpiIdentityForAdmission, mpiPatientDisplay,
  type MpiLookup, type MpiPatient,
} from "@/services/mpi/admission";

export interface LegacyPatientMigrationRequest {
  patientUuid: string;
  run: string;
  legacyIdentifier: string;
}

interface Props {
  request: LegacyPatientMigrationRequest;
  onCancel(): void;
  onConfirm(): void;
}

function IdentityCard({ patient, label }: { patient: MpiPatient; label: string }) {
  const details = mpiPatientDisplay(patient);
  return <article className="mpi-admission-patient">
    <span>{label}</span>
    <strong>{details.name || "Nombre no informado"}</strong>
    <dl><div><dt>Sexo registral</dt><dd>{details.gender}</dd></div><div><dt>Nacimiento</dt><dd>{details.birthDate}</dd></div></dl>
  </article>;
}

export function LegacyPatientMigrationDialog({ request, onCancel, onConfirm }: Props) {
  const [localPatient, setLocalPatient] = useState<MpiPatient>();
  const [mpi, setMpi] = useState<MpiLookup>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const local = await lookupLocalPatientByRun(request.run, controller.signal);
        if (local.length !== 1 || local[0]?.id !== request.patientUuid) {
          throw new Error(local.length > 1
            ? "El RUN está asociado a más de una ficha local. Resuelva la duplicación antes de continuar."
            : "El RUN no pudo vincularse de forma exclusiva con esta ficha local.");
        }
        setLocalPatient(local[0]);
        const lookup = await lookupMpiIdentityForAdmission(request.run, controller.signal);
        if (lookup.stale) throw new Error("El MPI no pudo entregar información vigente. Intente nuevamente antes de regularizar la ficha.");
        if (lookup.outcome === "ambiguous") throw new Error("El MPI devolvió varias identidades. Se requiere adjudicación antes de continuar.");
        if (lookup.outcome === "no-match" && lookup.source !== "minsal") throw new Error("El MPI nacional todavía no confirma la ausencia de otra identidad.");
        setMpi(lookup);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No fue posible verificar la identidad.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [request]);

  const verified = Boolean(localPatient && mpi && !error);
  const footer = <div className="legacy-migration-dialog-actions">
    <Button type="button" outlined label="Cancelar" disabled={loading} onClick={onCancel} />
    <Button type="button" icon="pi pi-check" label="Confirmar identidad y regularizar" loading={loading} disabled={!verified} onClick={onConfirm} />
  </div>;

  return <Dialog header="Regularizar ficha pre-MPI" visible modal draggable={false} resizable={false} closable={!loading} className="legacy-migration-dialog" footer={footer} onHide={() => { if (!loading) onCancel(); }}>
    <div className="legacy-migration-content">
      <p className="warning-banner"><i className="pi pi-info-circle" aria-hidden="true" /> Se actualizará esta misma ficha; no se creará otro paciente.</p>
      <p>Antes de guardar, coteje la identidad con el documento presentado y con los resultados siguientes.</p>
      <dl className="legacy-migration-plan">
        <div><dt>Número histórico</dt><dd><strong>{request.legacyIdentifier}</strong><span>Se conservará como alias para búsqueda y trazabilidad.</span></dd></div>
        <div><dt>Nuevo número clínico</dt><dd><strong>HCSBA autogenerado</strong><span>Será el identificador preferido de la ficha.</span></dd></div>
        <div><dt>RUN</dt><dd><strong>{request.run}</strong><span>Se registrará como documento oficial y se vinculará al MPI.</span></dd></div>
      </dl>
      {loading && <p role="status" className="legacy-migration-loading"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Verificando OpenMRS y MPI…</p>}
      {error && <p role="alert" className="error-banner">{error} No se realizó ningún cambio.</p>}
      {(localPatient || mpi?.patients.length) && <div className="mpi-admission-candidates">
        {localPatient && <IdentityCard patient={localPatient} label="Esta ficha en OpenMRS" />}
        {mpi?.patients.map((patient, index) => <IdentityCard key={patient.id ?? index} patient={patient} label={mpi.source === "minsal" ? "MPI nacional" : "MPI interno"} />)}
      </div>}
      {mpi?.outcome === "no-match" && <p className="success-banner">El MPI nacional no encontró otra identidad para este RUN. La ficha local verificada puede incorporarse al índice.</p>}
    </div>
  </Dialog>;
}
