import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { useState } from "react";
import { getPatientSummaries } from "@/services/bahmni/patients";
import { searchPatientBiometrics, type BiometricSearchResult } from "@/services/biometrics";
import type { PatientSearchResult } from "@/types/bahmni";
import { BiometricCameraDialog } from "./BiometricCameraDialog";

export type ResolvedBiometricCandidate = BiometricSearchResult["candidates"][number] & { patient?: PatientSearchResult };

function patientName(patient?: PatientSearchResult): string {
  if (!patient) return "Paciente no disponible";
  return [patient.givenName, patient.middleName, patient.familyName, patient.familyName2].filter(Boolean).join(" ") || "Paciente sin nombre";
}

export function BiometricCandidateList({ candidates, threshold, onOpen }: { candidates: ResolvedBiometricCandidate[]; threshold: number; onOpen(patientUuid: string): void }) {
  if (!candidates.length) return <p role="status" className="biometric-empty-results">No existen candidatos biométricos registrados para esta captura.</p>;
  return <div className="biometric-candidate-list">
    {candidates.map((candidate, index) => <article key={candidate.template_id} className="biometric-candidate-card">
      <span className="biometric-candidate-rank">{index + 1}</span>
      <div className="biometric-candidate-data"><strong>{patientName(candidate.patient)}</strong><span>{candidate.patient?.identifier || "Sin identificador visible"}</span><small>UUID {candidate.mpi_id}</small></div>
      <div className="biometric-candidate-score"><strong>{(candidate.similarity * 100).toFixed(1)}%</strong><span>{candidate.similarity >= threshold ? "Sobre referencia" : "Bajo referencia"}</span></div>
      <Button type="button" outlined label="Revisar perfil" icon="pi pi-user" onClick={() => onOpen(candidate.mpi_id)} />
    </article>)}
  </div>;
}

export function BiometricPatientSearch({ onOpenPatient }: { onOpenPatient(patientUuid: string): void }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BiometricSearchResult | null>(null);
  const [candidates, setCandidates] = useState<ResolvedBiometricCandidate[]>([]);

  const search = async (image: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await searchPatientBiometrics(image, 8);
      const summaries = await getPatientSummaries(response.candidates.map((candidate) => candidate.mpi_id));
      setResult(response);
      setCandidates(response.candidates.map((candidate) => ({ ...candidate, patient: summaries.get(candidate.mpi_id) })));
      setCameraOpen(false);
      setResultsOpen(true);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "No fue posible buscar candidatos biométricos.");
    } finally { setBusy(false); }
  };

  return <>
    <Button type="button" severity="secondary" icon="pi pi-camera" label="Buscar por rostro" onClick={() => { setError(""); setCameraOpen(true); }} />
    {cameraOpen && <BiometricCameraDialog visible title="Buscar pacientes por rostro" actionLabel="Buscar candidatos" busy={busy} error={error} onHide={() => setCameraOpen(false)} onCapture={(image) => void search(image)} />}
    <Dialog header="Candidatos biométricos" visible={resultsOpen} modal className="biometric-results-dialog" onHide={() => setResultsOpen(false)}>
      <div className="warning-banner biometric-review-warning"><i className="pi pi-exclamation-triangle" aria-hidden="true" /> Los resultados son candidatos ordenados por similitud. Revise identificador, nombre y antecedentes antes de elegir un perfil.</div>
      {result && <BiometricCandidateList candidates={candidates} threshold={result.threshold_reference} onOpen={(uuid) => { setResultsOpen(false); onOpenPatient(uuid); }} />}
    </Dialog>
  </>;
}
