import { Button } from "primereact/button";
import { useState } from "react";
import { verifyPatientBiometrics, type BiometricVerification } from "@/services/biometrics";
import { BiometricCameraDialog } from "./BiometricCameraDialog";

export function BiometricVerificationResult({ result }: { result: BiometricVerification }) {
  if (!result.template_found) return <div className="biometric-verification-result warning" role="status"><i className="pi pi-info-circle" aria-hidden="true" /><div><strong>Paciente sin plantilla biométrica</strong><span>Tome una nueva fotografía y elija registrar biometría antes de validar su identidad.</span></div></div>;
  const percentage = result.similarity === null ? "—" : `${(result.similarity * 100).toFixed(1)}%`;
  return <div className={`biometric-verification-result ${result.above_threshold ? "match" : "mismatch"}`} role="status">
    <i className={`pi ${result.above_threshold ? "pi-check-circle" : "pi-exclamation-triangle"}`} aria-hidden="true" />
    <div><strong>{result.above_threshold ? "Coincidencia biométrica sobre la referencia" : "El rostro no alcanza la referencia de coincidencia"}</strong><span>Similitud {percentage} · referencia {(result.threshold_reference * 100).toFixed(1)}%. Confirme siempre con los datos del paciente.</span></div>
  </div>;
}

export function PatientBiometricVerification({ patientUuid }: { patientUuid: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BiometricVerification | null>(null);
  const verify = async (image: string) => {
    setBusy(true);
    setError("");
    try {
      setResult(await verifyPatientBiometrics(patientUuid, image));
      setOpen(false);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "No fue posible validar el rostro.");
    } finally { setBusy(false); }
  };
  return <div className="patient-biometric-verification">
    <Button type="button" outlined icon="pi pi-shield" label="Validar identidad" onClick={() => { setError(""); setOpen(true); }} />
    {result && <BiometricVerificationResult result={result} />}
    {open && <BiometricCameraDialog visible title="Validar identidad biométrica" actionLabel="Comparar con el perfil" busy={busy} error={error} onHide={() => setOpen(false)} onCapture={(image) => void verify(image)} />}
  </div>;
}
